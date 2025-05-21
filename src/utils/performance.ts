// performance.ts
export type PerformanceMetrics = {
  operation: string;
  startTime: number;
  endTime: number;
  duration: number;
  details?: Record<string, any>;
};

type Phase = {
  name: string;
  startTime: number;
  endTime?: number;
};

class PerformanceTracker {
  private startTime: number = 0;
  private operation: string = '';
  private phases: Phase[] = [];
  private details: Record<string, any> = {};

  start(operation: string): void {
    this.startTime = performance.now();
    this.operation = operation;
    this.phases = [];
    this.details = {};
  }

  startPhase(name: string): void {
    this.phases.push({
      name,
      startTime: performance.now()
    });
  }

  endPhase(name?: string): void {
    const now = performance.now();
    const phaseIndex = name 
      ? this.phases.findIndex(p => p.name === name && !p.endTime)
      : this.phases.findIndex(p => !p.endTime);
    
    if (phaseIndex >= 0) {
      this.phases[phaseIndex].endTime = now;
    }
  }

  addDetail(key: string, value: any): void {
    this.details[key] = value;
  }

  end(): PerformanceMetrics {
    const endTime = performance.now();
    
    // Close any open phases
    this.phases.forEach(phase => {
      if (!phase.endTime) {
        phase.endTime = endTime;
      }
    });

    // Calculate durations for each phase
    const phaseDetails = this.phases.reduce((acc, phase) => {
      acc[phase.name] = {
        duration: (phase.endTime || endTime) - phase.startTime
      };
      return acc;
    }, {});

    return {
      operation: this.operation,
      startTime: this.startTime,
      endTime,
      duration: endTime - this.startTime,
      details: {
        ...this.details,
        phases: phaseDetails
      }
    };
  }
  
  formatMetrics(metrics: PerformanceMetrics): string {
    let result = `⏱️ ${metrics.operation}: ${metrics.duration.toFixed(2)}ms`;
    
    if (metrics.details?.phases) {
      result += '\n  Phases:';
      for (const [phaseName, phaseData] of Object.entries(metrics.details.phases)) {
        result += `\n    - ${phaseName}: ${phaseData.duration.toFixed(2)}ms`;
      }
    }
    
    // Add other details excluding phases
    const otherDetails = { ...metrics.details };
    delete otherDetails.phases;
    
    if (Object.keys(otherDetails).length > 0) {
      result += '\n  Details:';
      for (const [key, value] of Object.entries(otherDetails)) {
        result += `\n    - ${key}: ${JSON.stringify(value)}`;
      }
    }
    
    return result;
  }
}

export const performanceTracker = new PerformanceTracker();