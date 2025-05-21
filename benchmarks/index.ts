/**
 * FiberDB Benchmarks - Main Entry Point
 */
import { runPerformanceTest as runCacheBenchmark } from './cache';
import { runPerformanceTest as runParallelBenchmark } from './parallel';
import { runTests as runIndexingBenchmark } from './indexing';

const benchmarks = {
  cache: runCacheBenchmark,
  parallel: runParallelBenchmark,
  indexing: runIndexingBenchmark,
};

async function runAllBenchmarks() {
  console.log('=== Running All FiberDB Benchmarks ===\n');
  
  // Run cache benchmark
  console.log('\n\n===== CACHE PERFORMANCE BENCHMARK =====\n');
  await runCacheBenchmark();
  
  // Run parallel processing benchmark
  console.log('\n\n===== PARALLEL PROCESSING BENCHMARK =====\n');
  await runParallelBenchmark();
  
  // Run indexing benchmark
  console.log('\n\n===== INDEXING PERFORMANCE BENCHMARK =====\n');
  await runIndexingBenchmark();
  
  console.log('\n\n=== All Benchmarks Complete ===');
}

// Get the benchmark to run from command line arguments
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === 'all') {
    await runAllBenchmarks();
    return;
  }
  
  const benchmarkName = args[0];
  const benchmark = benchmarks[benchmarkName];
  
  if (!benchmark) {
    console.error(`Unknown benchmark: ${benchmarkName}`);
    console.error('Available benchmarks: cache, parallel, indexing, all');
    process.exit(1);
  }
  
  await benchmark();
}

// Run the benchmarks if this is the main module
if (import.meta.main) {
  main().catch(error => {
    console.error('Error running benchmarks:', error);
    process.exit(1);
  });
}

export { runAllBenchmarks };