export const S = {
    zoom: 3.0,
    offset: { x: -0.743643887037158, y: 0.131825904205311 },
    isAutoZooming: false,
    lastFrameTime: 0,
    // Spec 1.3 decision: keep 1e-30 as the declared product target, but it is NOT
    // deliverable by the current DS pipeline (empirical ceiling ~1e12-1e13, Phase 3).
    // Reaching 1e-30 requires Phase 4 perturbation theory (zoom_precision_spec.md).
    minZoom: 1e-30,
    colorCycle: 0,
    isColorCycling: false,
    useAutoIterations: true,
    targetIterations: 100,
    currentIterations: 100,
    currentLerpSpeed: 0.02,
    isIterOscillating: false,
    iterOscillatePhase: 0,
    iterOscillateSpeed: 0.5,
    iterOscillateMin: 50,
    iterOscillateMax: 1000,
    oscillateTargetIter: 100,
    oscillateSmoothIter: 100,
    perfMode: false,
    frameTimes: [],
    avgFPS: 0,
    avgIterations: 0,
    maxIterationsSeen: 0,
    totalPixelOps: 0,
    frameCount: 0,
    perfDisplayTimer: 0,
    MAX_FRAME_HISTORY: 30,
    shaderFamily: 'quad',
    perturbMode: 'auto',
    perturbSupported: false,
    shaderProgram: null,
    shaderUniforms: null,
    debugMode: 0, // 0=normal, 1=debug color
    supersample: false, // default off: keep perf baseline clean; toggle for AA test (spec 0.3)
};
