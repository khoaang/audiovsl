import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import Meyda from 'meyda';

// Add AudioContext type definition for browsers
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

interface WaveformSyncProps {
  videoSrc: string;
  audioSrc: string;
  offsetSeconds: number;
  onOffsetChange: (offset: number) => void;
  className?: string;
  height?: number;
}

export function WaveformSync({ 
  videoSrc, 
  audioSrc, 
  offsetSeconds, 
  onOffsetChange,
  className,
  height
}: WaveformSyncProps) {
  const videoCanvasRef = useRef<HTMLCanvasElement>(null);
  const audioCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoAudioRef = useRef<HTMLAudioElement | null>(null);
  const uploadedAudioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const playbackTimerRef = useRef<number | null>(null);
  const analyzerTimerRef = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartOffset, setDragStartOffset] = useState(0);
  const [videoWaveformData, setVideoWaveformData] = useState<number[]>([]);
  const [audioWaveformData, setAudioWaveformData] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<'both' | 'video' | 'audio'>('both');
  const [playbackProgress, setPlaybackProgress] = useState(0); // 0-1 value
  const [audioDuration, setAudioDuration] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [syncSuggestions, setSyncSuggestions] = useState<number[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(null);
  const [videoRawData, setVideoRawData] = useState<Float32Array | null>(null);
  const [audioRawData, setAudioRawData] = useState<Float32Array | null>(null);
  
  // Shared AudioContext instance to prevent creating too many
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Initialize audio elements
  useEffect(() => {
    if (!videoSrc || !audioSrc) return;
    
    // Create video audio element
    if (!videoAudioRef.current) {
      videoAudioRef.current = new Audio(videoSrc);
      videoAudioRef.current.crossOrigin = 'anonymous';
      videoAudioRef.current.preload = 'auto';
      videoAudioRef.current.onloadedmetadata = () => {
        setVideoDuration(videoAudioRef.current?.duration || 0);
      };
    } else {
      videoAudioRef.current.src = videoSrc;
      videoAudioRef.current.onloadedmetadata = () => {
        setVideoDuration(videoAudioRef.current?.duration || 0);
      };
    }
    
    // Create uploaded audio element
    if (!uploadedAudioRef.current) {
      uploadedAudioRef.current = new Audio(audioSrc);
      uploadedAudioRef.current.crossOrigin = 'anonymous';
      uploadedAudioRef.current.preload = 'auto';
      uploadedAudioRef.current.onloadedmetadata = () => {
        setAudioDuration(uploadedAudioRef.current?.duration || 0);
      };
    } else {
      uploadedAudioRef.current.src = audioSrc;
      uploadedAudioRef.current.onloadedmetadata = () => {
        setAudioDuration(uploadedAudioRef.current?.duration || 0);
      };
    }
    
    return () => {
      // Cleanup function to prevent memory leaks
      if (videoAudioRef.current) {
        videoAudioRef.current.pause();
        videoAudioRef.current.src = '';
        videoAudioRef.current.load();
      }
      
      if (uploadedAudioRef.current) {
        uploadedAudioRef.current.pause();
        uploadedAudioRef.current.src = '';
        uploadedAudioRef.current.load();
      }
    };
  }, [videoSrc, audioSrc]);
  
  // Animation logic for playback - directly track the actual audio playback
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
      return;
    }
    
    const updateProgress = () => {
      // Get the current playback time from the appropriate audio element
      let currentTime = 0;
      let totalDuration = 1;
      
      if (playbackMode === 'video' && videoAudioRef.current) {
        currentTime = videoAudioRef.current.currentTime;
        totalDuration = videoAudioRef.current.duration || 1;
      } 
      else if (playbackMode === 'audio' && uploadedAudioRef.current) {
        currentTime = uploadedAudioRef.current.currentTime;
        totalDuration = uploadedAudioRef.current.duration || 1;
      }
      else if (playbackMode === 'both') {
        // For 'both' mode, use the track that started first
        if (offsetSeconds >= 0 && videoAudioRef.current) {
          // Video started first
          currentTime = videoAudioRef.current.currentTime;
          totalDuration = videoAudioRef.current.duration || 1;
          
          // If we're past the offset point, account for audio's play time too
          if (currentTime > offsetSeconds && uploadedAudioRef.current) {
            // Use the video time as the reference
            const audioPlayTime = currentTime - offsetSeconds;
            // No need to adjust totalDuration as we're scaling based on video duration
          }
        } 
        else if (offsetSeconds < 0 && uploadedAudioRef.current) {
          // Audio started first
          currentTime = uploadedAudioRef.current.currentTime;
          totalDuration = uploadedAudioRef.current.duration || 1;
          
          // If we're past the offset point, account for video's play time too
          if (currentTime > Math.abs(offsetSeconds) && videoAudioRef.current) {
            // Use the audio time as the reference
            const videoPlayTime = currentTime - Math.abs(offsetSeconds);
            // No need to adjust totalDuration as we're scaling based on audio duration
          }
        }
      }
      
      // Calculate progress as a percentage (0-1)
      const progress = Math.min(currentTime / totalDuration, 1);
      setPlaybackProgress(progress);
      
      // Check if playback has ended
      if (progress >= 0.999 || isPlaybackEnded()) {
        setIsPlaying(false);
        setPlaybackProgress(0);
        return;
      }
      
      animationFrameRef.current = requestAnimationFrame(updateProgress);
    };
    
    // Start tracking progress
    animationFrameRef.current = requestAnimationFrame(updateProgress);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, playbackMode, offsetSeconds]);
  
  // Helper to get the duration of the primary track based on playback mode and offset
  const getPrimaryDuration = () => {
    if (playbackMode === 'video') return videoDuration || 10;
    if (playbackMode === 'audio') return audioDuration || 10;
    
    // For 'both' mode
    if (offsetSeconds >= 0) {
      // Video starts first, so total duration is video duration + offset
      return (videoDuration || 10);
    } else {
      // Audio starts first, so total duration is audio duration
      return (audioDuration || 10);
    }
  };
  
  // Helper to check if playback has ended
  const isPlaybackEnded = () => {
    if (playbackMode === 'video' && videoAudioRef.current?.ended) return true;
    if (playbackMode === 'audio' && uploadedAudioRef.current?.ended) return true;
    if (playbackMode === 'both') {
      // In 'both' mode, playback ends when both tracks have ended or when the one that started first ends
      const videoEnded = videoAudioRef.current?.ended || false;
      const audioEnded = uploadedAudioRef.current?.ended || false;
      
      if (offsetSeconds >= 0) {
        // Video started first
        return videoEnded;
      } else {
        // Audio started first
        return audioEnded;
      }
    }
    return false;
  };
  
  // Play/pause function
  const togglePlayback = (mode: 'both' | 'video' | 'audio') => {
    if (isPlaying && playbackMode === mode) {
      // Stop playback
      if (videoAudioRef.current) {
        videoAudioRef.current.pause();
      }
      if (uploadedAudioRef.current) {
        uploadedAudioRef.current.pause();
      }
      setIsPlaying(false);
      setPlaybackProgress(0);
    } else {
      // Start playback
      setPlaybackMode(mode);
      
      // Reset playback position
      if (videoAudioRef.current) {
        videoAudioRef.current.currentTime = 0;
        videoAudioRef.current.pause();
      }
      if (uploadedAudioRef.current) {
        uploadedAudioRef.current.currentTime = 0;
        uploadedAudioRef.current.pause();
      }
      
      // Play the appropriate audio sources with offset
      if (mode === 'both' || mode === 'video') {
        if (videoAudioRef.current) {
          videoAudioRef.current.play().catch(err => {
            console.error("Error playing video audio:", err);
            setIsPlaying(false);
            alert("Failed to play video audio. Please check your browser's autoplay settings.");
          });
        }
      }
      
      if (mode === 'both' || mode === 'audio') {
        if (uploadedAudioRef.current) {
          if (offsetSeconds > 0) {
            // Audio starts later than video
            setTimeout(() => {
              if (uploadedAudioRef.current) {
                uploadedAudioRef.current.play().catch(err => {
                  console.error("Error playing audio:", err);
                  setIsPlaying(false);
                  alert("Failed to play audio. Please check your browser's autoplay settings.");
                });
              }
            }, offsetSeconds * 1000);
          } else {
            // Audio starts before video
            uploadedAudioRef.current.play().catch(err => {
              console.error("Error playing audio:", err);
              setIsPlaying(false);
              alert("Failed to play audio. Please check your browser's autoplay settings.");
            });
            
            if (mode === 'both' && videoAudioRef.current) {
              // Delay video audio start
              setTimeout(() => {
                if (videoAudioRef.current) {
                  videoAudioRef.current.play().catch(err => {
                    console.error("Error playing video audio:", err);
                    setIsPlaying(false);
                    alert("Failed to play video audio. Please check your browser's autoplay settings.");
                  });
                }
              }, Math.abs(offsetSeconds) * 1000);
            }
          }
        }
      }
      
      setIsPlaying(true);
      // Initialize progress to 0
      setPlaybackProgress(0);
    }
  };
  
  // Get or create the shared AudioContext
  const getAudioContext = () => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
    }
    return audioContextRef.current;
  };
  
  // Analyze audio for sync detection - returns raw audio data and processed waveform
  const analyzeAudioData = async (url: string): Promise<{rawData: Float32Array, waveform: number[], features: any}> => {
    let retryCount = 0;
    const maxRetries = 2;
    
    const attemptAnalysis = async (): Promise<{rawData: Float32Array, waveform: number[], features: any}> => {
      try {
        const audioContext = getAudioContext();
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
          throw new Error('Received empty audio buffer');
        }
        
        let audioBuffer;
        try {
          audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        } catch (decodeError) {
          console.error("Audio decoding error:", decodeError);
          throw new Error('Failed to decode audio data');
        }
        
        // Get the raw audio data (we'll use the first channel)
        const rawData = audioBuffer.getChannelData(0);
        
        if (!rawData || rawData.length === 0) {
          throw new Error('Audio data contains no samples');
        }
        
        // Process for visualization (reduced sample rate)
        const samples = 150; // Number of data points for visualization
        const blockSize = Math.floor(rawData.length / samples);
        const filteredData = [];
        
        for (let i = 0; i < samples; i++) {
          let blockStart = blockSize * i;
          let sum = 0;
          
          // Take the absolute average of each block
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(rawData[blockStart + j] || 0);
          }
          
          filteredData.push(sum / blockSize);
        }
        
        // Normalize the visualization data to a range between 0 and 1
        const maxValue = Math.max(...filteredData, 0.01);
        const normalizedData = filteredData.map(n => n / maxValue);
        
        // Extract advanced audio features using Meyda more efficiently
        let features = {};
        try {
          features = extractAudioFeatures(rawData, audioContext.sampleRate);
        } catch (featureError) {
          console.warn("Feature extraction failed, using basic features:", featureError);
          // Continue without advanced features
        }
        
        return { 
          rawData,
          waveform: normalizedData,
          features
        };
      } catch (error) {
        console.error("Error analyzing audio:", error);
        
        if (retryCount < maxRetries) {
          console.log(`Retrying audio analysis (attempt ${retryCount + 1} of ${maxRetries})...`);
          retryCount++;
          return await attemptAnalysis();
        }
        
        // Fallback to placeholder data after all retries fail
        console.warn("All retry attempts failed, using placeholder data");
        const placeholderWaveform = Array(150).fill(0).map((_, i) => 
          (Math.sin(i * 0.1) * 0.3 + 0.5)
        );
        const placeholderRawData = new Float32Array(1000).fill(0).map((_, i) => 
          Math.sin(i * 0.01)
        );
        
        return { 
          rawData: placeholderRawData,
          waveform: placeholderWaveform,
          features: {}
        };
      }
    };
    
    return attemptAnalysis();
  };
  
  // Extract audio features using Meyda for improved sync detection
  const extractAudioFeatures = (audioData: Float32Array, sampleRate: number) => {
    // Reduce the amount of processing by using a larger frame size and hop size
    // We'll work with much fewer chunks of audio to extract features
    const frameSize = 2048; // Larger frame size
    const hopSize = 4096;   // Much larger hop size for performance
    
    // Limit the amount of audio we process to improve performance
    const maxDuration = 30; // Only analyze up to 30 seconds
    const maxSamples = Math.min(audioData.length, sampleRate * maxDuration);
    const processData = audioData.slice(0, maxSamples);
    
    const numFrames = Math.floor((processData.length - frameSize) / hopSize) + 1;
    
    // Feature arrays
    const spectralCentroids: number[] = [];
    const rms: number[] = [];
    const onsets: number[] = [];
    const mfccs: number[][] = [];
    
    // Process in a more memory-efficient manner
    let lastRMS = 0;
    
    for (let i = 0; i < numFrames; i++) {
      const startIndex = i * hopSize;
      const frame = processData.slice(startIndex, startIndex + frameSize);
      
      // Extract features using Meyda without creating new AudioContext instances
      try {
        const features = Meyda.extract([
          "spectralCentroid", 
          "rms",
          "mfcc"
        ], frame);
        
        if (features) {
          spectralCentroids.push(features.spectralCentroid || 0);
          
          const currentRMS = features.rms || 0;
          rms.push(currentRMS);
          
          // Simplified onset detection
          if (i > 0 && 
              currentRMS > 0.1 && // Energy threshold
              currentRMS > 1.5 * lastRMS) { // Significant increase in energy
            onsets.push(startIndex / sampleRate); // Convert to seconds
          }
          
          lastRMS = currentRMS;
          
          if (features.mfcc) {
            // Only store a subset of MFCC frames for performance
            if (i % 3 === 0) { // Store every 3rd frame
              mfccs.push(features.mfcc);
            }
          }
        }
      } catch (e) {
        console.log("Meyda feature extraction error:", e);
      }
    }
    
    return {
      spectralCentroids,
      rms,
      onsets,
      mfccs
    };
  };
  
  // Enhanced beat detection using Meyda's features
  const detectBeats = (audioData: Float32Array, sampleRate: number = 44100, features: any = null) => {
    // If we have pre-computed features, use them
    if (features && features.onsets && features.onsets.length > 0) {
      return features.onsets;
    }
    
    // Fall back to our original implementation if no features available
    const minBeatInterval = 0.25; // Minimum interval between beats in seconds
    const minBeatIntervalSamples = Math.floor(minBeatInterval * sampleRate);
    const threshold = 0.5; // Amplitude threshold for beat detection
    
    // Filter the signal to focus on the range where beats are common
    const filtered = lowPassFilter(audioData, sampleRate);
    
    // Find peaks (potential beats)
    const beats = [];
    let lastBeatSample = -minBeatIntervalSamples;
    
    for (let i = 1; i < filtered.length - 1; i++) {
      if (filtered[i] > threshold && 
          filtered[i] > filtered[i-1] && 
          filtered[i] > filtered[i+1] && 
          i - lastBeatSample > minBeatIntervalSamples) {
        beats.push(i / sampleRate); // Convert to seconds
        lastBeatSample = i;
      }
    }
    
    return beats;
  };
  
  // Low-pass filter for audio processing
  const lowPassFilter = (signal: Float32Array, sampleRate: number, cutoffFreq: number = 200) => {
    const rc = 1.0 / (cutoffFreq * 2 * Math.PI);
    const dt = 1.0 / sampleRate;
    const alpha = dt / (rc + dt);
    
    const filtered = new Float32Array(signal.length);
    filtered[0] = signal[0];
    
    for (let i = 1; i < signal.length; i++) {
      filtered[i] = filtered[i-1] + alpha * (signal[i] - filtered[i-1]);
    }
    
    return filtered;
  };
  
  // Enhanced correlation function using spectral features for more accurate matching
  const findEnhancedCorrelation = (videoFeatures: any, audioFeatures: any, 
                                  videoData: Float32Array, audioData: Float32Array) => {
    // We won't use audio-sync as it's not designed for sync detection
    
    // Initialize results array
    const results = [];
    
    // Use the original cross-correlation as a baseline
    const basicCorrelation = findCorrelation(videoData, audioData);
    results.push(...basicCorrelation.map(r => ({...r, method: 'basic-correlation'})));
    
    // Use MFCC-based correlation if available
    if (videoFeatures.mfccs && audioFeatures.mfccs && 
        videoFeatures.mfccs.length > 0 && audioFeatures.mfccs.length > 0) {
      
      // Compare MFCCs using Dynamic Time Warping-inspired approach
      const mfccResults = compareMFCCs(videoFeatures.mfccs, audioFeatures.mfccs);
      results.push(...mfccResults.map(r => ({...r, method: 'mfcc'})));
    }
    
    // Use onset matching if onsets were detected
    if (videoFeatures.onsets && audioFeatures.onsets && 
        videoFeatures.onsets.length > 0 && audioFeatures.onsets.length > 0) {
      
      const onsetResults = matchOnsets(videoFeatures.onsets, audioFeatures.onsets);
      results.push(...onsetResults.map(r => ({...r, method: 'onset'})));
    }
    
    return results;
  };
  
  // Compare MFCCs between two audio sources to find optimal alignment
  const compareMFCCs = (videoMFCCs: number[][], audioMFCCs: number[][]) => {
    const maxOffsetFrames = 500; // Limit search range for performance
    const results = [];
    
    // Limit the size for performance
    const vMFCCs = videoMFCCs.slice(0, 1000);
    const aMFCCs = audioMFCCs.slice(0, 1000);
    
    // For each possible offset
    for (let offset = -maxOffsetFrames; offset <= maxOffsetFrames; offset += 10) {
      let similarity = 0;
      let count = 0;
      
      // Calculate similarity for this offset
      for (let i = 0; i < vMFCCs.length; i++) {
        const j = i + offset;
        if (j >= 0 && j < aMFCCs.length) {
          // Calculate cosine similarity between MFCC vectors
          const sim = cosineSimilarity(vMFCCs[i], aMFCCs[j]);
          similarity += sim;
          count++;
        }
      }
      
      // Normalize and store result
      const normalizedSimilarity = count > 0 ? similarity / count : 0;
      const offsetSeconds = offset * 0.01; // Approximate conversion to seconds
      
      results.push({
        offset: parseFloat(offsetSeconds.toFixed(2)),
        correlation: normalizedSimilarity
      });
    }
    
    return results;
  };
  
  // Calculate cosine similarity between two vectors
  const cosineSimilarity = (a: number[], b: number[]) => {
    if (!a || !b || a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    return normA && normB ? dotProduct / (normA * normB) : 0;
  };
  
  // Match onset patterns between two audio sources
  const matchOnsets = (videoOnsets: number[], audioOnsets: number[]) => {
    if (videoOnsets.length === 0 || audioOnsets.length === 0) {
      return [];
    }
    
    const results = [];
    const maxOffset = 5; // Maximum offset in seconds
    
    // Try to match patterns of onsets rather than individual onsets
    for (let i = 0; i < videoOnsets.length - 2; i++) {
      const vPattern = [
        videoOnsets[i + 1] - videoOnsets[i],
        videoOnsets[i + 2] - videoOnsets[i + 1]
      ];
      
      for (let j = 0; j < audioOnsets.length - 2; j++) {
        const aPattern = [
          audioOnsets[j + 1] - audioOnsets[j],
          audioOnsets[j + 2] - audioOnsets[j + 1]
        ];
        
        // Check for similar time intervals between consecutive onsets
        const patternSimilarity = (
          Math.abs(vPattern[0] - aPattern[0]) < 0.1 &&
          Math.abs(vPattern[1] - aPattern[1]) < 0.1
        ) ? 1 : 0;
        
        if (patternSimilarity > 0) {
          const offset = videoOnsets[i] - audioOnsets[j];
          
          // Only consider offsets within our range
          if (Math.abs(offset) <= maxOffset) {
            results.push({
              offset: parseFloat(offset.toFixed(2)),
              correlation: 0.7 + (0.3 * patternSimilarity) // High confidence for pattern matches
            });
          }
        }
      }
    }
    
    // If no pattern matches found, fall back to simple first onset alignment
    if (results.length === 0 && videoOnsets.length > 0 && audioOnsets.length > 0) {
      const offset = videoOnsets[0] - audioOnsets[0];
      
      if (Math.abs(offset) <= maxOffset) {
        results.push({
          offset: parseFloat(offset.toFixed(2)),
          correlation: 0.5 // Medium confidence for simple alignment
        });
      }
    }
    
    return results;
  };
  
  // Analyze both audio tracks to find sync suggestions
  const analyzeSyncPoints = async () => {
    if (!videoSrc || !audioSrc || isAnalyzing) return;
    
    setIsAnalyzing(true);
    setSyncSuggestions([]);
    
    try {
      console.log("Starting enhanced audio sync analysis...");
      
      // Process videos and audio sequentially to avoid resource contention
      console.log("Analyzing video audio track...");
      const videoData = await analyzeAudioData(videoSrc);
      
      console.log("Analyzing separate audio track...");
      const audioData = await analyzeAudioData(audioSrc);
      
      // Store raw data for visualization and further analysis
      setVideoRawData(videoData.rawData);
      setAudioRawData(audioData.rawData);
      setVideoWaveformData(videoData.waveform);
      setAudioWaveformData(audioData.waveform);
      
      // Draw the waveforms
      drawWaveform(videoCanvasRef.current, videoData.waveform, 'rgba(255, 255, 255, 0.6)');
      drawWaveform(audioCanvasRef.current, audioData.waveform, 'rgba(213, 128, 255, 0.6)');
      
      console.log("Finding optimal sync offset...");
      
      // Perform enhanced correlation using Meyda features
      const enhancedResults = findEnhancedCorrelation(
        videoData.features, 
        audioData.features,
        videoData.rawData,
        audioData.rawData
      );
      
      console.log("Enhanced correlation results:", enhancedResults);
      
      // Weight results by confidence and method
      const methodWeights: Record<string, number> = {
        'mfcc': 0.5,
        'onset': 0.3,
        'basic-correlation': 0.2
      };
      
      // Calculate weighted scores
      const weightedResults = enhancedResults.map(result => ({
        ...result,
        weightedScore: result.correlation * (methodWeights[result.method as keyof typeof methodWeights] || 0.1)
      }));
      
      // Sort by weighted score and extract top suggestions
      const sortedResults = weightedResults.sort((a, b) => b.weightedScore - a.weightedScore);
      
      // Extract sync suggestions (top 3 offsets to avoid overwhelming the user)
      const suggestions = sortedResults
        .slice(0, 3)
        .map(result => result.offset);
      
      // Add some variance around the best match
      const bestMatch = suggestions[0];
      if (bestMatch !== undefined) {
        // Add slight variations of the best match
        suggestions.push(bestMatch + 0.05);
        suggestions.push(bestMatch - 0.05);
      }
      
      // Add zero as a suggestion (perfect alignment)
      if (!suggestions.includes(0)) {
        suggestions.push(0);
      }
      
      // Sort and deduplicate suggestions
      const uniqueSuggestions = Array.from(new Set(suggestions))
        .filter(offset => offset >= -5 && offset <= 5) // Keep within our range
        .sort((a, b) => Math.abs(a) - Math.abs(b)); // Sort by absolute value (closest to 0 first)
      
      console.log("Final sync suggestions:", uniqueSuggestions);
      
      setSyncSuggestions(uniqueSuggestions);
      
      // Auto-select the first suggestion if it exists
      if (uniqueSuggestions.length > 0) {
        setSelectedSuggestion(uniqueSuggestions[0]);
        onOffsetChange(uniqueSuggestions[0]); // Auto-apply the best match
      }
    } catch (error) {
      console.error("Error analyzing sync points:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  // Calculate cross-correlation between audio samples to find sync points
  const findCorrelation = (signal1: Float32Array, signal2: Float32Array) => {
    // Use smaller portions of the signals for performance
    const maxSamples = 44100 * 10; // 10 seconds at 44.1kHz
    const s1 = signal1.slice(0, Math.min(signal1.length, maxSamples));
    const s2 = signal2.slice(0, Math.min(signal2.length, maxSamples));
    
    // Sample rate and offset range
    const sampleRate = 44100;
    const maxOffsetSeconds = 5; // Match our UI limit of -5 to +5 seconds
    const maxOffsetSamples = maxOffsetSeconds * sampleRate;
    
    // Step size to reduce computation (analyze every 0.1 seconds)
    const stepSize = Math.floor(sampleRate * 0.1);
    
    const results = [];
    
    // Calculate correlation for different offsets
    for (let offsetSamples = -maxOffsetSamples; offsetSamples <= maxOffsetSamples; offsetSamples += stepSize) {
      let correlation = 0;
      let count = 0;
      
      // Calculate the correlation at this offset
      for (let i = 0; i < s1.length; i++) {
        const j = i + offsetSamples;
        if (j >= 0 && j < s2.length) {
          correlation += s1[i] * s2[j];
          count++;
        }
      }
      
      // Normalize correlation
      correlation = count > 0 ? correlation / count : 0;
      
      // Convert offset back to seconds
      const offsetSeconds = offsetSamples / sampleRate;
      
      results.push({
        offset: parseFloat(offsetSeconds.toFixed(2)),
        correlation
      });
    }
    
    return results;
  };
  
  // Generate waveforms using Web Audio API
  useEffect(() => {
    if (!videoSrc || !audioSrc) return;
    
    // Initial analysis when sources change
    const initializeAnalysis = async () => {
      try {
        // Analyze both tracks
        const videoResult = await analyzeAudioData(videoSrc);
        const audioResult = await analyzeAudioData(audioSrc);
        
        // Update state with the results
        setVideoWaveformData(videoResult.waveform);
        setAudioWaveformData(audioResult.waveform);
        setVideoRawData(videoResult.rawData);
        setAudioRawData(audioResult.rawData);
        
        // Store durations
        if (videoSrc) {
          const audio = new Audio(videoSrc);
          audio.onloadedmetadata = () => setVideoDuration(audio.duration);
          audio.load();
        }
        
        if (audioSrc) {
          const audio = new Audio(audioSrc);
          audio.onloadedmetadata = () => setAudioDuration(audio.duration);
          audio.load();
        }
        
        // Draw waveforms
        drawWaveform(videoCanvasRef.current, videoResult.waveform, 'rgba(255, 255, 255, 0.6)');
        drawWaveform(audioCanvasRef.current, audioResult.waveform, 'rgba(213, 128, 255, 0.6)');
      } catch (error) {
        console.error("Error initializing audio analysis:", error);
        
        // Fallback to placeholder waveforms
        const videoPlaceholder = Array(150).fill(0).map((_, i) => (Math.sin(i * 0.1) * 0.3 + 0.5));
        const audioPlaceholder = Array(150).fill(0).map((_, i) => (Math.cos(i * 0.08) * 0.3 + 0.5));
        
        setVideoWaveformData(videoPlaceholder);
        setAudioWaveformData(audioPlaceholder);
        
        drawWaveform(videoCanvasRef.current, videoPlaceholder, 'rgba(255, 255, 255, 0.6)');
        drawWaveform(audioCanvasRef.current, audioPlaceholder, 'rgba(213, 128, 255, 0.6)');
      }
    };
    
    initializeAnalysis();
    
  }, [videoSrc, audioSrc]);
  
  // Update waveforms on window resize
  useEffect(() => {
    const handleResize = () => {
      drawWaveform(videoCanvasRef.current, videoWaveformData, 'rgba(255, 255, 255, 0.6)');
      drawWaveform(audioCanvasRef.current, audioWaveformData, 'rgba(213, 128, 255, 0.6)');
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [videoWaveformData, audioWaveformData]);
  
  // Draw waveform helper
  const drawWaveform = (canvas: HTMLCanvasElement | null, data: number[], color: string) => {
    if (!canvas || !data.length) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;
    
    // Clear the canvas
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    
    // Draw waveform background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    
    // Draw waveform
    ctx.fillStyle = color;
    
    // Draw the waveform as a continuous filled shape
    ctx.beginPath();
    
    // Start at the left edge, halfway down
    ctx.moveTo(0, HEIGHT / 2);
    
    // Draw top half of waveform
    data.forEach((value, i) => {
      const x = (i / data.length) * WIDTH;
      const y = ((1 - value) * HEIGHT / 2);
      ctx.lineTo(x, y);
    });
    
    // Draw bottom half of waveform (mirror of top half)
    data.slice().reverse().forEach((value, i) => {
      const x = WIDTH - (i / data.length) * WIDTH;
      const y = HEIGHT - ((1 - value) * HEIGHT / 2);
      ctx.lineTo(x, y);
    });
    
    ctx.closePath();
    ctx.fill();
    
    // Add a subtle glow effect
    ctx.shadowBlur = 5;
    ctx.shadowColor = color;
    ctx.stroke();
  };
  
  // Handle dragging to adjust offset
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartOffset(offsetSeconds);
    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    
    const containerWidth = containerRef.current.clientWidth;
    const deltaX = e.clientX - dragStartX;
    
    // Convert pixel distance to seconds - full container width is 10 seconds
    // Dragging right = positive offset (audio plays later)
    // Dragging left = negative offset (audio plays earlier)
    const deltaSeconds = (deltaX / containerWidth) * 10;
    
    // Update offset with correct direction
    const newOffset = Math.max(-5, Math.min(5, dragStartOffset + deltaSeconds));
    onOffsetChange(parseFloat(newOffset.toFixed(1)));
    
    // Clear the selected suggestion when manually dragging
    setSelectedSuggestion(null);
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
    document.body.style.userSelect = '';
  };
  
  // Calculate the offset for the audio waveform in pixels
  const getAudioOffsetPixels = () => {
    if (!containerRef.current) return 0;
    const containerWidth = containerRef.current.clientWidth;
    // Convert seconds to pixels (5 seconds = half container width)
    return (offsetSeconds / 10) * containerWidth;
  };
  
  // Apply a sync suggestion
  const applySuggestion = (offset: number) => {
    onOffsetChange(parseFloat(offset.toFixed(1)));
    setSelectedSuggestion(offset);
  };
  
  // Stop playback when offset changes
  useEffect(() => {
    if (isPlaying) {
      if (videoAudioRef.current) {
        videoAudioRef.current.pause();
      }
      if (uploadedAudioRef.current) {
        uploadedAudioRef.current.pause();
      }
      setIsPlaying(false);
      setPlaybackProgress(0);
    }
  }, [offsetSeconds]);

  // Cleanup function for audio context when component unmounts
  useEffect(() => {
    return () => {
      // Clean up timers
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
      
      if (analyzerTimerRef.current) {
        clearInterval(analyzerTimerRef.current);
        analyzerTimerRef.current = null;
      }
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // Close audio context to free up resources
      if (audioContextRef.current) {
        if (audioContextRef.current.state !== 'closed') {
          try {
            audioContextRef.current.close();
          } catch (e) {
            console.warn('Error closing AudioContext:', e);
          }
        }
        audioContextRef.current = null;
      }
      
      // Clean up audio elements
      if (videoAudioRef.current) {
        videoAudioRef.current.pause();
        videoAudioRef.current.src = '';
        videoAudioRef.current.load();
        videoAudioRef.current = null;
      }
      
      if (uploadedAudioRef.current) {
        uploadedAudioRef.current.pause();
        uploadedAudioRef.current.src = '';
        uploadedAudioRef.current.load();
        uploadedAudioRef.current = null;
      }
    };
  }, []);

  // Reset analysis state when video or audio sources change
  useEffect(() => {
    setSyncSuggestions([]);
    setSelectedSuggestion(null);
    
    // Cleanup function
    return () => {
      if (videoAudioRef.current) {
        videoAudioRef.current.pause();
      }
      if (uploadedAudioRef.current) {
        uploadedAudioRef.current.pause();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
      }
      if (analyzerTimerRef.current) {
        clearTimeout(analyzerTimerRef.current);
      }
      setIsPlaying(false);
      setIsAnalyzing(false);
    };
  }, [videoSrc, audioSrc]);

  return (
    <div className="flex flex-col space-y-4">
      <div 
        ref={containerRef}
        className={cn("relative h-32 border border-white/[0.12] rounded-md overflow-hidden bg-gradient-to-r from-gray-800 to-gray-900", className)}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Center timeline marker without the "now" label */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-white/70 left-1/2 z-30 pointer-events-none" />
        
        {/* Playback progress indicator - gray bar that slides in from left */}
        {isPlaying && (
          <div 
            className="absolute top-0 bottom-0 left-0 bg-blue-500/50 z-10 pointer-events-none"
            style={{ 
              width: `${playbackProgress * 100}%`,
            }}
          />
        )}
        
        {/* Waveform container - both waveforms are positioned relative to this */}
        <div className="absolute inset-0 flex flex-col overflow-hidden">
          {/* Video waveform - always fixed in position */}
          <div className="h-1/2 relative border-b border-white/10">
            <div className="absolute left-0 top-0 px-2 py-1 text-[10px] text-white/80 z-20 uppercase tracking-wide font-medium">video</div>
            <div className="absolute inset-0 flex items-center justify-center">
              <canvas 
                ref={videoCanvasRef} 
                width={600} 
                height={100}
                className="w-full h-full"
              />
            </div>
          </div>
          
          {/* Audio waveform - position shifts based on offset */}
          <div className="h-1/2 relative">
            <div className="absolute left-0 bottom-0 px-2 py-1 text-[10px] text-[#d580ff]/80 z-20 uppercase tracking-wide font-medium">audio</div>
            <div 
              className="absolute inset-0 flex items-center justify-center"
              style={{ 
                transform: `translateX(${getAudioOffsetPixels()}px)` 
              }}
            >
              <canvas 
                ref={audioCanvasRef} 
                width={600} 
                height={100}
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
        
        {/* Debugging indicator to show accurate playback time */}
        <div className="absolute bottom-0 left-0 text-[8px] text-white/80 px-1 z-30 pointer-events-none">
          {isPlaying ? (playbackMode === 'video' ? 
            `V: ${videoAudioRef.current?.currentTime.toFixed(1)}s` : 
            (playbackMode === 'audio' ? 
              `A: ${uploadedAudioRef.current?.currentTime.toFixed(1)}s` : 
              `${Math.round(playbackProgress * 100)}%`)) 
            : (isAnalyzing ? 'analyzing...' : '')}
        </div>
        
        {/* Drag instruction */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-xs text-white/30 lowercase">
            {isDragging ? 
              'release to set offset' : 
              (isPlaying ? '' : 'drag horizontally to adjust audio timing')}
          </div>
        </div>
      </div>
      
      {/* Auto-sync controls */}
      <div className="flex flex-wrap gap-2 mb-2">
        <button
          onClick={analyzeSyncPoints}
          disabled={isAnalyzing || !videoSrc || !audioSrc}
          className={cn(
            "text-xs px-3 py-1 rounded-md border border-white/[0.12]",
            isAnalyzing 
              ? "opacity-70 bg-surface-3 text-foreground/40" 
              : "bg-surface-3 text-foreground/70 hover:text-foreground/90"
          )}
        >
          {isAnalyzing ? 'analyzing...' : 'enhanced audio sync'}
        </button>
        
        {syncSuggestions.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {syncSuggestions.map((suggestion, index) => (
              <button
                key={`suggestion-${index}`}
                onClick={() => applySuggestion(suggestion)}
                className={cn(
                  "text-xs px-3 py-1 rounded-md border",
                  selectedSuggestion === suggestion
                    ? "soft-white border-white/20"
                    : "border-white/[0.12] bg-surface-3 text-foreground/60 hover:text-foreground/90"
                )}
              >
                {suggestion > 0 ? `+${suggestion.toFixed(1)}s` : suggestion.toFixed(1)}s
              </button>
            ))}
            
            <button
              onClick={() => setSyncSuggestions([])}
              className="text-xs px-3 py-1 rounded-md border border-white/[0.12] bg-surface-3 text-foreground/40 hover:text-foreground/70"
            >
              clear
            </button>
          </div>
        )}
      </div>
      
      {/* Playback controls */}
      <div className="flex justify-between items-center">
        <div className="text-xs text-foreground/70 lowercase">
          offset: {offsetSeconds.toFixed(1)}s
          {offsetSeconds > 0 ? ' (audio starts later)' : 
           offsetSeconds < 0 ? ' (audio starts earlier)' : 
           ' (perfectly aligned)'}
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={() => togglePlayback('both')}
            className={cn(
              "text-xs px-3 py-1 rounded-md border border-white/[0.12]",
              (isPlaying && playbackMode === 'both') 
                ? "soft-white border-white/20" 
                : "text-foreground/60 hover:text-foreground/90 bg-surface-3"
            )}
          >
            {isPlaying && playbackMode === 'both' ? 'stop' : 'play both'}
          </button>
          
          <button
            onClick={() => togglePlayback('video')}
            className={cn(
              "text-xs px-3 py-1 rounded-md border border-white/[0.12]",
              (isPlaying && playbackMode === 'video') 
                ? "soft-white border-white/20" 
                : "text-foreground/60 hover:text-foreground/90 bg-surface-3"
            )}
          >
            {isPlaying && playbackMode === 'video' ? 'stop' : 'video only'}
          </button>
          
          <button
            onClick={() => togglePlayback('audio')}
            className={cn(
              "text-xs px-3 py-1 rounded-md border border-white/[0.12]",
              (isPlaying && playbackMode === 'audio') 
                ? "soft-white border-white/20" 
                : "text-foreground/60 hover:text-foreground/90 bg-surface-3"
            )}
          >
            {isPlaying && playbackMode === 'audio' ? 'stop' : 'audio only'}
          </button>
        </div>
      </div>
    </div>
  );
} 