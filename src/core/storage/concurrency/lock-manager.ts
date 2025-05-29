export class LockManager {
  private locks = new Map<string, Promise<void>>();
  private readLocks = new Map<string, number>();
  private writeLocks = new Set<string>();
  private lockQueue = new Map<string, Array<() => void>>();
  private deadlockTimeout = 10000; // 10 seconds

  async withWriteLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const timeoutPromise = this.createTimeoutPromise(key);
    
    try {
      // Wait for any existing locks
      await Promise.race([
        this.waitForWriteAccess(key),
        timeoutPromise
      ]);

      // Create write lock
      let resolveLock: () => void;
      const lockPromise = new Promise<void>(resolve => {
        resolveLock = resolve;
      });

      this.locks.set(key, lockPromise);
      this.writeLocks.add(key);

      try {
        return await operation();
      } finally {
        this.releaseLock(key, resolveLock!);
      }
    } catch (error) {
      if (error instanceof DeadlockError) {
        throw error;
      }
      throw new Error(`Lock acquisition failed for ${key}: ${error}`);
    }
  }

  async withReadLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const timeoutPromise = this.createTimeoutPromise(key);
    
    try {
      // Wait for write locks to clear
      await Promise.race([
        this.waitForReadAccess(key),
        timeoutPromise
      ]);

      // Increment read lock count
      this.readLocks.set(key, (this.readLocks.get(key) || 0) + 1);

      try {
        return await operation();
      } finally {
        this.releaseReadLock(key);
      }
    } catch (error) {
      if (error instanceof DeadlockError) {
        throw error;
      }
      throw new Error(`Read lock acquisition failed for ${key}: ${error}`);
    }
  }

  async withMultipleWriteLocks<T>(keys: string[], operation: () => Promise<T>): Promise<T> {
    // Sort keys to prevent deadlocks
    const sortedKeys = [...keys].sort();
    
    return this.acquireMultipleLocks(sortedKeys, 0, operation);
  }

  private async acquireMultipleLocks<T>(
    keys: string[], 
    index: number, 
    operation: () => Promise<T>
  ): Promise<T> {
    if (index >= keys.length) {
      return await operation();
    }
    
    const key = keys[index];
    return this.withWriteLock(key, () => 
      this.acquireMultipleLocks(keys, index + 1, operation)
    );
  }

  private async waitForWriteAccess(key: string): Promise<void> {
    while (this.locks.has(key) || this.readLocks.has(key)) {
      await this.waitForLock(key);
    }
  }

  private async waitForReadAccess(key: string): Promise<void> {
    while (this.writeLocks.has(key)) {
      await this.waitForLock(key);
    }
  }

  private async waitForLock(key: string): Promise<void> {
    if (this.locks.has(key)) {
      await this.locks.get(key);
    }
    
    // Add to queue if lock is still held
    if (this.locks.has(key) || this.writeLocks.has(key)) {
      return new Promise<void>(resolve => {
        if (!this.lockQueue.has(key)) {
          this.lockQueue.set(key, []);
        }
        this.lockQueue.get(key)!.push(resolve);
      });
    }
    
    // Small delay to prevent tight loops
    await new Promise(resolve => setTimeout(resolve, 1));
  }

  private releaseLock(key: string, resolveLock: () => void): void {
    this.locks.delete(key);
    this.writeLocks.delete(key);
    resolveLock();
    
    // Notify queued waiters
    const queue = this.lockQueue.get(key);
    if (queue && queue.length > 0) {
      const nextWaiter = queue.shift();
      if (nextWaiter) {
        nextWaiter();
      }
      
      if (queue.length === 0) {
        this.lockQueue.delete(key);
      }
    }
  }

  private releaseReadLock(key: string): void {
    const count = this.readLocks.get(key);
    if (!count) return;
    
    if (count === 1) {
      this.readLocks.delete(key);
      
      // Notify any waiting writers
      const queue = this.lockQueue.get(key);
      if (queue && queue.length > 0) {
        const nextWaiter = queue.shift();
        if (nextWaiter) {
          nextWaiter();
        }
        
        if (queue.length === 0) {
          this.lockQueue.delete(key);
        }
      }
    } else {
      this.readLocks.set(key, count - 1);
    }
  }

  private createTimeoutPromise(key: string): Promise<never> {
    return new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new DeadlockError(`Deadlock detected while waiting for lock on ${key}`));
      }, this.deadlockTimeout);
    });
  }

  getLockStats(): {
    activeLocks: number;
    activeReadLocks: number;
    activeWriteLocks: number;
    queuedOperations: number;
  } {
    const queuedOperations = Array.from(this.lockQueue.values())
      .reduce((sum, queue) => sum + queue.length, 0);
    
    return {
      activeLocks: this.locks.size,
      activeReadLocks: this.readLocks.size,
      activeWriteLocks: this.writeLocks.size,
      queuedOperations
    };
  }

  async forceReleaseLocks(): Promise<void> {
    console.warn('Force releasing all locks - this may cause data corruption');
    
    this.locks.clear();
    this.readLocks.clear();
    this.writeLocks.clear();
    
    // Resolve all queued operations
    for (const [key, queue] of this.lockQueue.entries()) {
      queue.forEach(resolve => resolve());
    }
    this.lockQueue.clear();
  }
}

export class DeadlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeadlockError';
  }
}