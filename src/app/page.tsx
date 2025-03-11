'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import * as Progress from '@radix-ui/react-progress';
import { cn } from '@/lib/utils';
import { VideoSettings, type VideoSettings as VideoSettingsType, type SyncOptions } from './components/VideoSettings';
import { TextPreview } from './components/TextPreview';

// Add global type declarations for window object
declare global {
  interface Window {
    videoUrl?: string;
    audioUrl?: string;
    fetchFileUtil?: (file: File) => Promise<Uint8Array>;
  }
}

interface MediaFile {
  file: File;
  type: 'image' | 'gif' | 'video';
  url: string;
  duration?: number;
}

interface AudioDetails {
  file: File;
  url: string;
  duration?: number;
}

// Add interface for project data
interface ProjectData {
  mediaFile?: MediaFile;
  audioFile?: AudioDetails;
  videoSettings: VideoSettingsType;
  syncOptions: SyncOptions;
  version: string;
}

interface ExportRecord {
  id: string;
  timestamp: number;
  settings: {
    aspectRatio: string;
    resolution: string;
    visualizationStyle?: string;
    exportPreset?: string;
  };
  duration: number; // processing time in seconds
}

export default function Home() {
  const [mediaFile, setMediaFile] = useState<MediaFile | null>(null);
  const [audioFile, setAudioFile] = useState<AudioDetails | null>(null);
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [ffmpeg, setFFmpeg] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [videoSettings, setVideoSettings] = useState<VideoSettingsType>({
    aspectRatio: '16:9',
    resolution: '720p',
    textElements: [],
  });
  const [syncOptions, setSyncOptions] = useState<SyncOptions>({
    mode: 'loop-media'
  });
  const [randomTagline, setRandomTagline] = useState<string>('');
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const originalVideoAudioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const [exportHistory, setExportHistory] = useState<ExportRecord[]>(() => {
    // Load history from localStorage if available
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('exportHistory');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('Failed to parse export history:', e);
        }
      }
    }
    return [];
  });

  const [showHistory, setShowHistory] = useState(false);

  const [ffmpegLoadingStatus, setFfmpegLoadingStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const taglines = [
    "im looking at you, type beat producers",
    "your ugly ass youtube needs this",
    "because basic visualizers ain't it",
    "no more windows movie maker",
    "elevate your tiktok game",
    "your beats deserve better",
    "finally, something better than a static image",
    "i see you uploading that anime girl again",
    "because your music is fire, but your visuals...",
    "level up your promo game"
  ];

  // Initialize random tagline on client-side only
  useEffect(() => {
    setRandomTagline(taglines[Math.floor(Math.random() * taglines.length)]);
  }, []);

  const isCORSError = (error: unknown): boolean => {
    if (error instanceof Error) {
      return error.message.includes('Failed to fetch') || 
             error.message.includes('CORS') || 
             error.message.includes('cross-origin') ||
             error.message.includes('Shared memory') ||
             error.message.toLowerCase().includes('access-control-allow-origin');
    }
    return false;
  };

  const checkBrowserCompatibility = (): { isCompatible: boolean; issues: string[] } => {
    const issues: string[] = [];
    
    // Check if running in browser
    if (typeof window === 'undefined') {
      return { isCompatible: true, issues: [] }; // Skip on server-side
    }
    
    console.log('🔍 Browser details:', {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      vendor: navigator.vendor
    });
    
    // Check for SharedArrayBuffer support (required for FFmpeg)
    if (typeof SharedArrayBuffer === 'undefined') {
      issues.push('SharedArrayBuffer is not supported in this browser');
      console.warn('⚠️ SharedArrayBuffer is not available in this browser');
    } else {
      console.log('✅ SharedArrayBuffer is supported');
    }
    
    // Check for cross-origin isolation (required for SharedArrayBuffer)
    if (typeof window.crossOriginIsolated === 'boolean') {
      console.log('🔍 Cross-Origin Isolation status:', window.crossOriginIsolated);
      if (!window.crossOriginIsolated) {
        issues.push('Cross-origin isolation is not enabled');
        console.warn('⚠️ Cross-origin isolation is not enabled (required for SharedArrayBuffer)');
      } else {
        console.log('✅ Cross-origin isolation is enabled');
      }
    } else {
      console.warn('⚠️ Cannot determine cross-origin isolation status');
      issues.push('Cannot determine cross-origin isolation status');
    }
    
    // Check for WebAssembly support
    if (typeof WebAssembly === 'object') {
      console.log('✅ WebAssembly is supported');
      
      // Check for specific WebAssembly features
      const wasmFeatures = {
        bulkMemory: false,
        exceptions: false,
        simd: false,
        threads: false
      };
      
      try {
        if (WebAssembly.validate) {
          // Check SIMD support
          wasmFeatures.simd = WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,7,8,1,4,116,101,115,116,0,0,10,10,1,8,0,65,0,253,15,253,98,11]));
          
          // Check Threads support
          wasmFeatures.threads = WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,5,3,1,0,1,10,11,1,9,0,65,0,254,16,2,0,26,11]));
          
          console.log('🔍 WebAssembly features detected:', wasmFeatures);
          
          if (!wasmFeatures.threads) {
            issues.push('WebAssembly threads not supported (required for optimal FFmpeg performance)');
            console.warn('⚠️ WebAssembly threads not supported');
          }
        }
      } catch (e) {
        console.warn('⚠️ Error checking WebAssembly features:', e);
      }
    } else {
      issues.push('WebAssembly is not supported in this browser');
      console.warn('⚠️ WebAssembly is not supported in this browser');
    }
    
    // Check for Web Workers support
    if (typeof Worker === 'undefined') {
      issues.push('Web Workers are not supported in this browser');
      console.warn('⚠️ Web Workers are not supported');
    } else {
      console.log('✅ Web Workers are supported');
    }
    
    // Check CORS headers by making a test request
    console.log('🔍 Testing CORS headers for FFmpeg files...');
    fetch('/ffmpeg/ffmpeg-core.js', { method: 'HEAD' })
      .then(response => {
        const corsHeaders = {
          'cross-origin-embedder-policy': response.headers.get('cross-origin-embedder-policy'),
          'cross-origin-opener-policy': response.headers.get('cross-origin-opener-policy'),
          'cross-origin-resource-policy': response.headers.get('cross-origin-resource-policy')
        };
        console.log('🔍 CORS headers for FFmpeg files:', corsHeaders);
      })
      .catch(err => {
        console.warn('⚠️ Could not test CORS headers:', err);
      });
    
    return {
      isCompatible: issues.length === 0,
      issues
    };
  };

  // Load FFmpeg
  const loadFFmpeg = async () => {
    try {
      console.log('🔍 Starting FFmpeg load process...');
      setFfmpegLoadingStatus('loading');
      
      // Check browser compatibility first
      console.log('🔍 Checking browser compatibility...');
      const { isCompatible, issues } = checkBrowserCompatibility();
      if (!isCompatible) {
        console.warn('⚠️ Browser compatibility issues detected:', issues);
      } else {
        console.log('✅ Browser compatibility check passed');
      }
      
      // Check if FFmpeg files exist
      console.log('🔍 Verifying FFmpeg files availability...');
      try {
        const coreResponse = await fetch('/ffmpeg/ffmpeg-core.js', { method: 'HEAD' });
        const wasmResponse = await fetch('/ffmpeg/ffmpeg-core.wasm', { method: 'HEAD' });
        
        console.log('FFmpeg core.js status:', coreResponse.status, coreResponse.ok);
        console.log('FFmpeg core.wasm status:', wasmResponse.status, wasmResponse.ok);
        
        if (!coreResponse.ok || !wasmResponse.ok) {
          console.error('⚠️ Some FFmpeg files are not accessible!');
        } else {
          console.log('✅ All FFmpeg files are accessible');
        }
      } catch (fetchError) {
        console.error('❌ Error checking FFmpeg files:', fetchError);
      }
      
      // Dynamically import FFmpeg modules
      console.log('🔍 Importing FFmpeg modules...');
      try {
        const { FFmpeg } = await import('@ffmpeg/ffmpeg');
        console.log('✅ FFmpeg module imported successfully');
        const { fetchFile } = await import('@ffmpeg/util');
        console.log('✅ fetchFile utility imported successfully');
        
        // Store fetchFile for later use
        window.fetchFileUtil = fetchFile;
        console.log('✅ fetchFile stored in window object');
        
        // Create and configure FFmpeg instance
        console.log('🔍 Creating FFmpeg instance...');
        const ffmpegInstance = new FFmpeg();
        console.log('✅ FFmpeg instance created');
        
        // Set up logging
        ffmpegInstance.on('log', ({ message }) => {
          console.log('📝 FFmpeg internal log:', message);
        });
        
        // Set up progress logging
        ffmpegInstance.on('progress', (progress) => {
          console.log(`📊 FFmpeg loading progress: ${progress.progress * 100}%`);
        });
        
        console.log('🔄 Loading FFmpeg...');
        
        // Try loading with proper CORS settings to avoid security issues
        try {
          console.log('🔍 Attempting to load FFmpeg with optimized settings...');
          
          // Check if we're running on Netlify production
          const isNetlify = typeof window !== 'undefined' && 
                           (window.location.hostname.includes('netlify.app') || 
                            window.location.hostname === 'audiovsl.com');
          
          console.log('Is running on production?', isNetlify);
          
          // If we're on Netlify, try CDN first since local loading has issues there
          if (isNetlify) {
            console.log('🔍 Production environment detected, trying CDN loading first...');
            try {
              // Add a timeout to CDN loading
              const cdnLoadPromise = ffmpegInstance.load({
                coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.4/dist/esm/ffmpeg-core.js',
                wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.4/dist/umd/ffmpeg-core.wasm',
                workerURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.4/dist/umd/ffmpeg-core.worker.js'
              });
              
              // Create a timeout promise
              const cdnTimeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('CDN FFmpeg loading timed out after 15 seconds')), 15000);
              });
              
              // Race the load and the timeout
              await Promise.race([cdnLoadPromise, cdnTimeoutPromise]);
              
              console.log('✅ FFmpeg loaded successfully via CDN in production!');
              setFFmpeg(ffmpegInstance);
              setLoaded(true);
              setFfmpegLoadingStatus('success');
              return; // Exit early if CDN loading worked
            } catch (cdnError) {
              console.error('❌ Production CDN loading failed, falling back to local files:', cdnError);
            }
          }
          
          console.log('Using paths:', {
            coreURL: '/ffmpeg/ffmpeg-core.js',
            wasmURL: '/ffmpeg/ffmpeg-core.wasm',
          });
          
          // Add a timeout to prevent hanging indefinitely - reduce to 10 seconds
          const loadPromise = ffmpegInstance.load({
            coreURL: '/ffmpeg/ffmpeg-core.js',
            wasmURL: '/ffmpeg/ffmpeg-core.wasm',
          });
          
          // Create a timeout promise - reduce to 10 seconds for faster fallback
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('FFmpeg loading timed out after 10 seconds')), 10000);
          });
          
          // Race the load and the timeout
          await Promise.race([loadPromise, timeoutPromise]);
          
          console.log('✅ FFmpeg loaded successfully!');
          setFFmpeg(ffmpegInstance);
          setLoaded(true);
          setFfmpegLoadingStatus('success');
          
          // Add test to see if FFmpeg is actually working
          try {
            console.log('🔍 Testing FFmpeg functionality...');
            const files = await ffmpegInstance.listDir('/');
            console.log('FFmpeg file system contents:', files);
            
            // Test a simple FFmpeg command
            try {
              await ffmpegInstance.exec(['-version']);
              console.log('✅ FFmpeg version check successful!');
            } catch (cmdError) {
              console.error('❌ FFmpeg command test failed:', cmdError);
            }
          } catch (testError) {
            console.error('❌ Error testing FFmpeg functionality:', testError);
          }
        } catch (localLoadError) {
          console.error('❌ Error loading from local files:', localLoadError);
          console.error('Error details:', JSON.stringify(localLoadError, Object.getOwnPropertyNames(localLoadError)));
          
          // Fallback to auto-loading
          try {
            console.log('🔄 Trying default loading method...');
            
            // Add a timeout to default loading as well
            const defaultLoadPromise = ffmpegInstance.load();
            
            // Create a timeout promise
            const defaultTimeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Default FFmpeg loading timed out after 10 seconds')), 10000);
            });
            
            // Race the load and the timeout
            await Promise.race([defaultLoadPromise, defaultTimeoutPromise]);
            
            console.log('✅ FFmpeg loaded successfully via default method!');
            setFFmpeg(ffmpegInstance);
            setLoaded(true);
            setFfmpegLoadingStatus('success');
          } catch (defaultLoadError) {
            console.error('❌ Default loading also failed:', defaultLoadError);
            console.error('Default load error details:', JSON.stringify(defaultLoadError, Object.getOwnPropertyNames(defaultLoadError)));
            
            // Add third fallback to CDN loading
            try {
              console.log('🔄 Trying CDN loading method as last resort...');
              
              // Add a timeout to CDN loading as well
              const cdnLoadPromise = ffmpegInstance.load({
                coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.4/dist/esm/ffmpeg-core.js',
                wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.4/dist/umd/ffmpeg-core.wasm',
                workerURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.4/dist/umd/ffmpeg-core.worker.js'
              });
              
              // Create a timeout promise
              const cdnTimeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('CDN FFmpeg loading timed out after 15 seconds')), 15000);
              });
              
              // Race the load and the timeout
              await Promise.race([cdnLoadPromise, cdnTimeoutPromise]);
              
              console.log('✅ FFmpeg loaded successfully via CDN!');
              setFFmpeg(ffmpegInstance);
              setLoaded(true);
              setFfmpegLoadingStatus('success');
              
              // Test if FFmpeg is working
              try {
                const files = await ffmpegInstance.listDir('/');
                console.log('FFmpeg file system contents (CDN load):', files);
              } catch (testError) {
                console.error('❌ Error testing FFmpeg functionality after CDN load:', testError);
              }
            } catch (cdnLoadError) {
              console.error('❌ CDN loading also failed:', cdnLoadError);
              console.error('CDN load error details:', JSON.stringify(cdnLoadError, Object.getOwnPropertyNames(cdnLoadError)));
              throw cdnLoadError;
            }
          }
        }
      } catch (importError) {
        console.error('❌ Error importing FFmpeg modules:', importError);
        console.error('Import error details:', JSON.stringify(importError, Object.getOwnPropertyNames(importError)));
        throw importError;
      }
    } catch (error) {
      console.error('❌ Failed to load FFmpeg:', error);
      console.error('Final error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      setFfmpegLoadingStatus('error');
      // Don't rethrow to prevent app crash
      alert('Failed to load video processing engine. Please try refreshing the page or use a different browser.');
    }
  };

  // Call loadFFmpeg when the component mounts
  useEffect(() => {
    loadFFmpeg();
  }, []);

  // Add a safety timeout to clear loading state if it gets stuck
  useEffect(() => {
    if (ffmpegLoadingStatus === 'loading') {
      const timeoutId = setTimeout(() => {
        console.error('❌ FFmpeg loading got stuck and timed out after 30 seconds');
        setFfmpegLoadingStatus('error');
      }, 30000); // 30 seconds maximum loading time
      
      return () => clearTimeout(timeoutId);
    }
  }, [ffmpegLoadingStatus]);

  const getMediaType = (file: File): 'image' | 'gif' | 'video' => {
    if (file.type.startsWith('video/')) {
      return 'video';
    } else if (file.type === 'image/gif') {
      return 'gif';
    } else {
      return 'image';
    }
  };

  const onMediaDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const mediaType = getMediaType(file);
      
      if (mediaType === 'video') {
        // Revoke previous URL if it exists
        if (window.videoUrl) {
          URL.revokeObjectURL(window.videoUrl);
        }
        
        // Create and store the URL in the window object
        const url = URL.createObjectURL(file);
        window.videoUrl = url;
        
        // Create video element to get duration
        const video = document.createElement('video');
        video.src = url;
        video.onloadedmetadata = () => {
          setMediaFile({
            file,
            type: mediaType,
            url,
            duration: video.duration || 0
          });
        };
        video.onerror = () => {
          console.error('Error loading video');
        };
        
        // Load the metadata
        video.load();
      } else {
        // Handle as before for other media types
        const url = URL.createObjectURL(file);
        setMediaFile({
          file,
          type: mediaType,
          url,
        });
      }
    }
  }, []);

  const onAudioDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      
      // Revoke previous URL if it exists
      if (window.audioUrl) {
        URL.revokeObjectURL(window.audioUrl);
      }
      
      // Create and store the URL in the window object
      const url = URL.createObjectURL(file);
      window.audioUrl = url;
      
      // Create audio element to get duration
      const audio = new Audio();
      audio.src = url;
      audio.onloadedmetadata = () => {
        setAudioFile({
          file,
          url,
          duration: audio.duration || 0
        });
      };
      audio.onerror = () => {
        console.error('Error loading audio');
      };
      
      // Load the metadata
      audio.load();
    }
  }, []);

  const { getRootProps: getMediaRootProps, getInputProps: getMediaInputProps } = useDropzone({
    onDrop: onMediaDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif'],
      'video/*': ['.mp4', '.webm', '.mov']
    },
    maxFiles: 1,
  });

  const { getRootProps: getAudioRootProps, getInputProps: getAudioInputProps } = useDropzone({
    onDrop: onAudioDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a']
    },
    maxFiles: 1,
  });

  const getPreviewDimensions = () => {
    if (!previewRef.current) return { width: 0, height: 0 };
    
    const container = previewRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    // Calculate dimensions based on selected aspect ratio
    const [width, height] = videoSettings.aspectRatio.split(':').map(Number);
    const aspectRatio = width / height;
    
    if (containerWidth / aspectRatio <= containerHeight) {
      // Width is the limiting factor
      return {
        width: containerWidth - 40,
        height: (containerWidth - 40) / aspectRatio
      };
    } else {
      // Height is the limiting factor
      return {
        width: (containerHeight - 40) * aspectRatio,
        height: containerHeight - 40
      };
    }
  };

  // Save export history to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && exportHistory.length > 0) {
      localStorage.setItem('exportHistory', JSON.stringify(exportHistory));
    }
  }, [exportHistory]);

  // Add a record to export history
  const addExportRecord = (duration: number) => {
    const newRecord: ExportRecord = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      settings: {
        aspectRatio: videoSettings.aspectRatio,
        resolution: videoSettings.resolution,
        visualizationStyle: videoSettings.visualizationStyle,
        exportPreset: videoSettings.exportPreset?.name,
      },
      duration
    };
    
    setExportHistory(prev => [newRecord, ...prev.slice(0, 9)]); // Keep last 10 records
  };

  const fetchAndConvertToUint8Array = async (file: File): Promise<Uint8Array> => {
    try {
      // Memory optimization: Check file size and warn if too large
      if (file.size > 100 * 1024 * 1024) { // 100MB limit
        console.warn('File is very large, processing may be slow or fail:', 
          Math.round(file.size / (1024 * 1024)), 'MB');
      }
      
      // First, try using the @ffmpeg/util fetchFile function if available
      if (window.fetchFileUtil) {
        try {
          console.log('Using FFmpeg fetchFile utility...');
          return await window.fetchFileUtil(file);
        } catch (fetchError) {
          console.warn('FFmpeg fetchFile failed, falling back to native methods:', fetchError);
        }
      }
      
      // Second, try using arrayBuffer (modern method)
      if (typeof file.arrayBuffer === 'function') {
        try {
          // Performance: Use smaller chunk size for large files to avoid memory issues
          if (file.size > 50 * 1024 * 1024) { // 50MB
            console.log('Large file detected, using chunked processing');
            // The actual chunking would be complex, let's use a simple approach for now
          }
          
          const arrayBuffer = await file.arrayBuffer();
          return new Uint8Array(arrayBuffer);
        } catch (arrayBufferError) {
          console.warn('arrayBuffer method failed:', arrayBufferError);
          // Continue to fallbacks
        }
      }
      
      // Fallback for browsers that don't support File.arrayBuffer
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        // Add timeout to prevent hanging
        const timeout = setTimeout(() => {
          reader.abort();
          reject(new Error('FileReader timeout - operation took too long'));
        }, 30000); // 30 second timeout
        
        reader.onload = () => {
          clearTimeout(timeout);
          if (reader.result instanceof ArrayBuffer) {
            resolve(new Uint8Array(reader.result));
          } else {
            reject(new Error('FileReader did not produce an ArrayBuffer'));
          }
        };
        
        reader.onerror = () => {
          clearTimeout(timeout);
          reject(reader.error || new Error('Unknown FileReader error'));
        };
        
        reader.readAsArrayBuffer(file);
      });
    } catch (error) {
      console.error('Error converting file to Uint8Array:', error);
      // Last resort fallback using a different approach to fetch the file
      try {
        const response = await fetch(URL.createObjectURL(file));
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
      } catch (fetchError) {
        console.error('All file conversion methods failed:', fetchError);
        throw new Error('Unable to process file - browser may not support required features');
      }
    }
  };

  const processMedia = async () => {
    // Implement file size validation to prevent browser crashes
    if (mediaFile && mediaFile.file.size > 200 * 1024 * 1024) { // 200MB
      alert('Media file is too large. Maximum size is 200MB. Please choose a smaller file.');
      return;
    }
    
    if (audioFile && audioFile.file.size > 50 * 1024 * 1024) { // 50MB
      alert('Audio file is too large. Maximum size is 50MB. Please choose a smaller file.');
      return;
    }

    if (!mediaFile || !audioFile || !ffmpeg) {
      console.error('Cannot process: missing media file, audio file, or FFmpeg');
      return;
    }

    const startTime = Date.now();
    
    try {
      setProcessing(true);
      setProgress(0);

      console.log('Starting FFmpeg processing with:', { 
        mediaType: mediaFile.type, 
        mediaSize: mediaFile.file.size,
        audioSize: audioFile.file.size,
        aspectRatio: videoSettings.aspectRatio
      });

      // Create simplified file names with valid extensions
      const inputFileName = 'input.mp4';
      const audioFileName = 'audio.mp3';
      const outputFileName = 'output.mp4';
      
      // First check if FFmpeg is properly loaded and has required methods
      console.log('Checking FFmpeg capabilities...');
      if (typeof ffmpeg.writeFile !== 'function' || typeof ffmpeg.readFile !== 'function') {
        throw new Error('FFmpeg instance does not have required file methods. Please reload the page and try again.');
      }
      
      // Add memory cleanup before starting to prevent memory leaks
      try {
        const existingFiles = await ffmpeg.listDir('/');
        for (const file of existingFiles) {
          await ffmpeg.deleteFile(file);
          console.log(`Cleaned up existing file: ${file}`);
        }
      } catch (cleanupError) {
        console.warn('File cleanup error (non-critical):', cleanupError);
      }
      
      try {
        // Try to list directory contents to verify FFmpeg is working
        try {
          const rootFiles = await ffmpeg.listDir('/');
          console.log('FFmpeg root directory contents:', rootFiles);
        } catch (listError) {
          console.warn('Could not list FFmpeg root directory (this is normal for first run):', listError);
        }
        
        // Write media file with simplified error handling
        console.log('Converting and writing media file...');
        let mediaData = await fetchAndConvertToUint8Array(mediaFile.file);
        console.log(`Media data converted, size: ${mediaData.length} bytes`);
        
        try {
          // Performance: Add progress logging for large files
          if (mediaData.length > 20 * 1024 * 1024) {
            console.log('Writing large media file to FFmpeg...');
          }
          
          await ffmpeg.writeFile(inputFileName, mediaData);
          console.log('Media file successfully written to FFmpeg memory');
          
          // Free memory by removing the reference, allowing garbage collection
          // mediaData = null; // This causes a type error
        } catch (writeMediaError) {
          console.error('Error writing media file:', writeMediaError);
          throw new Error('Failed to write media file to FFmpeg memory');
        }
        
        // Write audio file with simplified error handling
        console.log('Converting and writing audio file...');
        let audioData = await fetchAndConvertToUint8Array(audioFile.file);
        console.log(`Audio data converted, size: ${audioData.length} bytes`);
        
        try {
          await ffmpeg.writeFile(audioFileName, audioData);
          console.log('Audio file successfully written to FFmpeg memory');
          
          // Free memory by removing the reference, allowing garbage collection
          // audioData = null; // This causes a type error
        } catch (writeAudioError) {
          console.error('Error writing audio file:', writeAudioError);
          throw new Error('Failed to write audio file to FFmpeg memory');
        }
        
        // Verify that files were written successfully by trying to read them
        console.log('Verifying files were written correctly...');
        
        try {
          const mediaFileData = await ffmpeg.readFile(inputFileName);
          console.log(`Successfully verified media file (size: ${mediaFileData.byteLength} bytes)`);
          
          const audioFileData = await ffmpeg.readFile(audioFileName);
          console.log(`Successfully verified audio file (size: ${audioFileData.byteLength} bytes)`);
        } catch (verifyError) {
          console.error('Error verifying files:', verifyError);
          throw new Error('Files were written but cannot be read back. FFmpeg memory may be corrupted.');
        }
      } catch (writeError: unknown) {
        console.error('Error during file preparation:', writeError);
        throw new Error(`Failed to prepare files: ${writeError instanceof Error ? writeError.message : String(writeError)}`);
      }

      // Use absolute paths for better reliability
      const inputFileAbsPath = `/${inputFileName}`;
      const audioFileAbsPath = `/${audioFileName}`;
      const outputFileAbsPath = `/${outputFileName}`;
      
      console.log('Preparing FFmpeg command with absolute paths:', {
        inputFile: inputFileAbsPath,
        audioFile: audioFileAbsPath,
        outputFile: outputFileAbsPath
      });
      
      // Build a simplified FFmpeg command that's more likely to succeed
      let ffmpegCommand: string[];
      
      // Performance optimization: Choose preset based on file size
      const preset = mediaFile.file.size > 50 * 1024 * 1024 ? 'ultrafast' : 'medium';
      
      // Calculate output dimensions based on aspect ratio and selected resolution
      const [width, height] = videoSettings.aspectRatio.split(':').map(Number);
      const aspectRatio = width / height;
      
      // Set output height based on resolution setting
      let outputHeight = 720; // Default to 720p
      if (videoSettings.resolution === '480p') outputHeight = 480;
      if (videoSettings.resolution === '720p') outputHeight = 720;
      if (videoSettings.resolution === '1080p') outputHeight = 1080;
      if (videoSettings.resolution === '1440p') outputHeight = 1440;
      if (videoSettings.resolution === '2160p') outputHeight = 2160;
      
      // Calculate width based on aspect ratio and height
      const outputWidth = Math.round(outputHeight * aspectRatio);
      
      console.log(`Output dimensions: ${outputWidth}x${outputHeight} (${videoSettings.resolution}, ${videoSettings.aspectRatio})`);
      
      if (mediaFile.type === 'video') {
        // Basic video + audio command
        ffmpegCommand = [
          '-y',                     // Force overwrite output
          '-i', inputFileAbsPath,   // Media input
          '-i', audioFileAbsPath,   // Audio input
          '-c:v', 'libx264',        // Video codec
          '-preset', preset,        // Encoding preset
          '-vf', `scale=${outputWidth}:${outputHeight}`, // Scale to desired aspect ratio
          '-c:a', 'aac',            // Audio codec
          '-b:a', '128k',           // Audio bitrate
          '-shortest',              // End when shortest input ends
          outputFileAbsPath         // Output file
        ];
      } else {
        // Image/GIF with audio
        ffmpegCommand = [
          '-y',                     // Force overwrite output
          '-loop', '1',             // Loop the image
          '-i', inputFileAbsPath,   // Media input
          '-i', audioFileAbsPath,   // Audio input
          '-c:v', 'libx264',        // Video codec
          '-tune', 'stillimage',    // Optimize for still image
          '-vf', `scale=${outputWidth}:${outputHeight}`, // Scale to desired aspect ratio
          '-pix_fmt', 'yuv420p',    // Required for compatibility
          '-preset', preset,        // Encoding preset
          '-c:a', 'aac',            // Audio codec
          '-b:a', '128k',           // Audio bitrate
          '-shortest',              // End when shortest input ends
          outputFileAbsPath         // Output file
        ];
      }
      
      // Add before executing the command
      console.log('Media type:', mediaFile.type);
      console.log('Using FFmpeg command:', ffmpegCommand.join(' '));
      
      // Execute the command with proper logging
      console.log('Executing FFmpeg command:', ffmpegCommand.join(' '));
      
      // Set up progress tracking with more detailed logging
      ffmpeg.on('progress', ({ progress }: { progress: number }) => {
        const roundedProgress = Math.round(progress * 100);
        setProgress(roundedProgress);
        console.log(`FFmpeg progress: ${roundedProgress}%`);
      });
      
      try {
        console.log('Starting FFmpeg execution...');
        
        // Add timeout protection for very long processes
        const execPromise = ffmpeg.exec(ffmpegCommand);
        const timeoutPromise = new Promise((_, reject) => {
          // 5 minute timeout for processing
          setTimeout(() => reject(new Error('FFmpeg processing timed out after 5 minutes')), 300000);
        });
        
        await Promise.race([execPromise, timeoutPromise]);
        console.log('FFmpeg command completed successfully');
        
        // Check if output file exists
        const outputFiles = await ffmpeg.listDir('/');
        
        // Log the complete structure for debugging
        console.log('Output files structure:', JSON.stringify(outputFiles));
        
        // Check if our output file exists in the returned files
        const outputFileExists = outputFiles.some((file: any) => {
          // Try various checks based on potential file object structures
          if (typeof file === 'string') {
            return file === outputFileName;
          } else if (file && typeof file === 'object') {
            return file.name === outputFileName || 
                   file.path === outputFileName || 
                   file === outputFileName;
          }
          return false;
        });
        
        if (!outputFileExists) {
          // For better logging, try to extract file names or paths
          const fileNames = outputFiles.map((file: any) => {
            if (typeof file === 'string') return file;
            if (file && typeof file === 'object') return file.name || file.path || String(file);
            return String(file);
          }).join(', ');
          
          console.error(`Output file '${outputFileName}' not found. Available files: ${fileNames}`);
          throw new Error(`Output file '${outputFileName}' was not created by FFmpeg`);
        }
        
        // If we get here, the file exists
        console.log(`Output file '${outputFileName}' found successfully`);
        
        // Try to read the output file
        console.log('Reading output file...');
        const data = await ffmpeg.readFile(outputFileName);
        console.log(`Output file size: ${data.byteLength} bytes`);
        
        if (data.byteLength === 0) {
          throw new Error('Output file is empty (0 bytes)');
        }
        
        // Create a blob and trigger download
        const blob = new Blob([data.buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `audiovsl_export_${Date.now()}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // Delay URL revocation to ensure download starts
        setTimeout(() => {
          URL.revokeObjectURL(url);
          console.log('Object URL revoked after download');
        }, 1000);
        
        console.log('Download triggered');
        
        // Record successful export
        const processDuration = (Date.now() - startTime) / 1000;
        addExportRecord(processDuration);
        
        setProcessing(false);
      } catch (execError: any) {
        console.error('Error executing FFmpeg command:', execError);
        
        // Try to get detailed error info from FFmpeg
        try {
          const logData = await ffmpeg.readFile('ffmpeg.log');
          if (logData.byteLength > 0) {
            const decoder = new TextDecoder();
            const logContent = decoder.decode(logData);
            console.error('FFmpeg log:', logContent);
          }
        } catch (logError) {
          console.warn('Could not read FFmpeg logs:', logError);
        }
        
        throw new Error(`FFmpeg processing failed: ${execError.message || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Error in overall processing:', error);
      
      // Attempt to clean up FFmpeg memory
      try {
        await ffmpeg.deleteFile('input.mp4').catch(() => {});
        await ffmpeg.deleteFile('audio.mp3').catch(() => {});
        await ffmpeg.deleteFile('output.mp4').catch(() => {});
      } catch (_) { /* Ignore cleanup errors */ }
      
      setProcessing(false);
      setProgress(0);
      
      alert(`Processing failed: ${error.message || 'Unknown error'}. Please try again or use different files.`);
    }
  };

  const previewOffset = () => {
    if (!(mediaFile?.type === 'video') || !audioFile || !videoRef.current) return;
    
    // Stop any existing preview
    if (previewAudio) {
      previewAudio.pause();
      previewAudio.currentTime = 0;
      setPreviewAudio(null);
    }
    
    // Extract audio from video if not already done
    if (!originalVideoAudioRef.current) {
      const videoEl = videoRef.current;
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioCtx.createMediaElementSource(videoEl);
      const destination = audioCtx.createMediaStreamDestination();
      source.connect(destination);
      
      // Save the original video audio
      const originalAudio = new Audio();
      originalAudio.srcObject = destination.stream;
      originalVideoAudioRef.current = originalAudio;
    }
    
    // Create a new audio element for the user's audio track
    const audio = new Audio(audioFile.url);
    setPreviewAudio(audio);
    
    // Apply offset
    const offset = syncOptions.offset || 0;
    
    // Reset video to start
    videoRef.current.currentTime = 0;
    videoRef.current.play();
    
    // Sync audio playback based on offset
    if (offset > 0) {
      // Positive offset: audio starts after video
      setTimeout(() => {
        audio.play();
      }, offset * 1000);
    } else {
      // Negative offset: audio starts before video
      audio.currentTime = Math.abs(offset);
      audio.play();
    }
    
    setIsPreviewPlaying(true);
    
    // Clean up when audio ends
    audio.onended = () => {
      videoRef.current?.pause();
      videoRef.current?.load(); // Reset video
      setIsPreviewPlaying(false);
    };
  };

  const stopPreview = () => {
    if (previewAudio) {
      previewAudio.pause();
      previewAudio.currentTime = 0;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.load(); // Reset video
    }
    setIsPreviewPlaying(false);
  };

  // Clean up resources when component unmounts
  useEffect(() => {
    return () => {
      if (window.videoUrl) {
        URL.revokeObjectURL(window.videoUrl);
        delete window.videoUrl;
      }
      if (window.audioUrl) {
        URL.revokeObjectURL(window.audioUrl);
        delete window.audioUrl;
      }
      // Clean up the FFmpeg instance
      if (ffmpeg) {
        try {
          ffmpeg.terminate();
        } catch (e) {
          console.warn("Error terminating FFmpeg:", e);
        }
      }
    };
  }, [ffmpeg]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in text inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      // Space bar - play/pause preview
      if (e.code === 'Space') {
        e.preventDefault();
        if (isPreviewPlaying) {
          stopPreview();
        } else {
          previewOffset();
        }
      }
      
      // Enter - process media
      if (e.code === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        if (!processing && mediaFile && audioFile) {
          processMedia();
        }
      }
      
      // Esc - stop preview
      if (e.code === 'Escape') {
        e.preventDefault();
        if (isPreviewPlaying) {
          stopPreview();
        }
      }
      
      // Shortcuts for sync offset adjustment
      if (e.code === 'ArrowLeft' && e.shiftKey) {
        e.preventDefault();
        // Decrease offset by 0.1 seconds
        setSyncOptions({
          ...syncOptions,
          offset: (syncOptions.offset || 0) - 0.1
        });
      }
      
      if (e.code === 'ArrowRight' && e.shiftKey) {
        e.preventDefault();
        // Increase offset by 0.1 seconds
        setSyncOptions({
          ...syncOptions,
          offset: (syncOptions.offset || 0) + 0.1
        });
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPreviewPlaying, processing, mediaFile, audioFile, syncOptions]);

  // Add a help tooltip component to show keyboard shortcuts
  const KeyboardShortcutsHelp = () => (
    <div className="fixed bottom-4 right-4 z-50">
      <button 
        className="bg-black/70 text-white p-2 rounded-full hover:bg-black/90 transition-colors"
        onClick={() => alert(`
Keyboard Shortcuts:
• Space: Play/pause preview
• Ctrl+Enter: Process media
• Esc: Stop preview
• Shift+Left Arrow: Decrease sync offset by 0.1s
• Shift+Right Arrow: Increase sync offset by 0.1s
        `)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>
    </div>
  );

  // Add save project function
  const saveProject = () => {
    if (!mediaFile || !audioFile) {
      alert("You need to upload both media and audio files before saving a project.");
      return;
    }

    try {
      // Prepare project data
      const projectData: ProjectData = {
        videoSettings,
        syncOptions,
        version: '1.0.0' // For future compatibility
      };

      // Save file URLs in localStorage for temporary access
      if (window.videoUrl) {
        localStorage.setItem('savedVideoUrl', window.videoUrl);
      }
      if (window.audioUrl) {
        localStorage.setItem('savedAudioUrl', window.audioUrl);
      }

      // Convert to JSON and save
      const projectJson = JSON.stringify(projectData);
      const blob = new Blob([projectJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      // Create download link
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audiovsl-project.json';
      a.click();

      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error saving project:", error);
      alert("Failed to save project. Please try again.");
    }
  };

  // Add load project function
  const loadProject = async (file: File) => {
    try {
      const projectText = await file.text();
      const projectData: ProjectData = JSON.parse(projectText);

      // Validate project file
      if (!projectData.version) {
        throw new Error("Invalid project file format");
      }

      // Load settings
      setVideoSettings(projectData.videoSettings);
      setSyncOptions(projectData.syncOptions);

      // Check if we have saved URLs in localStorage
      const savedVideoUrl = localStorage.getItem('savedVideoUrl');
      const savedAudioUrl = localStorage.getItem('savedAudioUrl');

      if (savedVideoUrl && savedAudioUrl) {
        // Prompt user to confirm loading saved media
        const shouldLoadSaved = confirm(
          "Previous media files were found in your browser storage. Do you want to load them? " +
          "(Select 'Cancel' if you want to upload new files instead)"
        );

        if (shouldLoadSaved) {
          // Create media file objects
          const dummyVideoFile = new File([""], "saved-video.mp4", { type: "video/mp4" });
          setMediaFile({
            file: dummyVideoFile,
            type: 'video',
            url: savedVideoUrl
          });
          window.videoUrl = savedVideoUrl;

          const dummyAudioFile = new File([""], "saved-audio.mp3", { type: "audio/mpeg" });
          setAudioFile({
            file: dummyAudioFile,
            url: savedAudioUrl
          });
          window.audioUrl = savedAudioUrl;
        }
      }

      alert("Project loaded successfully! If media files weren't loaded, please re-upload them.");
    } catch (error) {
      console.error("Error loading project:", error);
      alert("Failed to load project. The file might be corrupted or in an unsupported format.");
    }
  };

  // Add project file input ref
  const projectFileInputRef = useRef<HTMLInputElement>(null);

  // Add functions to handle file input
  const handleProjectFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      loadProject(files[0]);
    }
  };

  const openProjectFileDialog = () => {
    if (projectFileInputRef.current) {
      projectFileInputRef.current.click();
    }
  };

  // Format date for display
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  // History component
  const ExportHistoryPanel = () => (
    <div className={`fixed bottom-0 left-0 right-0 bg-black/90 transform transition-transform duration-300 ${showHistory ? 'translate-y-0' : 'translate-y-full'}`}>
      <div className="max-w-5xl mx-auto p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-white">Export History</h3>
          <button 
            onClick={() => setShowHistory(false)}
            className="text-white hover:text-gray-300"
          >
            Close
          </button>
        </div>
        
        {exportHistory.length === 0 ? (
          <p className="text-gray-400">No export history yet</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {exportHistory.map(record => (
              <div key={record.id} className="bg-zinc-800/50 p-3 rounded">
                <div className="text-sm text-gray-300">{formatDate(record.timestamp)}</div>
                <div className="text-xs text-gray-400 mt-1">
                  <div>Aspect Ratio: {record.settings.aspectRatio}</div>
                  <div>Resolution: {record.settings.resolution || '720p'}</div>
                  {record.settings.visualizationStyle && (
                    <div>Visualization: {record.settings.visualizationStyle}</div>
                  )}
                  {record.settings.exportPreset && (
                    <div>Preset: {record.settings.exportPreset}</div>
                  )}
                  <div className="mt-1">Processing time: {record.duration.toFixed(1)}s</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
  
  // Add a history button in your UI
  const HistoryButton = () => (
    <button
      onClick={() => setShowHistory(true)}
      className="fixed bottom-4 left-4 z-50 bg-black/70 text-white p-2 rounded-full hover:bg-black/90 transition-colors"
      title="View Export History"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8v4l3 3"></path>
        <circle cx="12" cy="12" r="10"></circle>
      </svg>
    </button>
  );

  // Add a loading indicator component
  const FFmpegLoadingIndicator = () => {
    const { isCompatible, issues } = checkBrowserCompatibility();
    
    if (ffmpegLoadingStatus === 'idle' || ffmpegLoadingStatus === 'success') {
      // Show a warning if browser has compatibility issues but FFmpeg loaded anyway
      if (!isCompatible && ffmpegLoadingStatus === 'success') {
        return (
          <div className="fixed top-0 left-0 right-0 bg-yellow-600/90 text-white p-2 z-50 text-center">
            <div className="flex items-center justify-center space-x-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              <span>Your browser has limited compatibility. Some features might not work correctly.</span>
            </div>
          </div>
        );
      }
      return null;
    }
    
    // Show compatibility issues along with loading status
    if (!isCompatible && ffmpegLoadingStatus === 'loading') {
      return (
        <div className="fixed top-0 left-0 right-0 bg-yellow-600/90 text-white p-2 z-50 text-center">
          <div className="flex items-center justify-center space-x-2">
            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
            <span>Loading video processor with limited browser compatibility...</span>
          </div>
          <div className="text-sm mt-1 opacity-80">
            {issues.map((issue, i) => (
              <div key={i}>{issue}</div>
            ))}
          </div>
        </div>
      );
    }
    
    return (
      <div className="fixed top-0 left-0 right-0 bg-black/80 text-white p-2 z-50 text-center">
        {ffmpegLoadingStatus === 'loading' ? (
          <div className="flex flex-col items-center justify-center">
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
              <span>Loading video processing engine...</span>
            </div>
            <div className="text-xs mt-1 text-gray-300">
              This may take up to 30 seconds. If it takes longer, try refreshing the page.
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="mt-2 px-2 py-1 bg-gray-600 rounded text-xs hover:bg-gray-500 transition-colors"
            >
              Force Refresh
            </button>
          </div>
        ) : (
          <div className="text-red-400 flex items-center justify-center space-x-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>Failed to load video processor. Please refresh and try again.</span>
            <button 
              onClick={loadFFmpeg}
              className="ml-2 px-2 py-1 bg-red-600 rounded text-xs hover:bg-red-700"
            >
              Retry
            </button>
            <button 
              onClick={() => window.location.reload()}
              className="ml-2 px-2 py-1 bg-gray-600 rounded text-xs hover:bg-gray-500"
            >
              Refresh Page
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between py-6 px-4 md:px-8 bg-gradient-to-tr from-zinc-900 via-zinc-800 to-zinc-900">
      {/* FFmpeg loading indicator */}
      <FFmpegLoadingIndicator />
      
      <div className="z-10 w-full max-w-full flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white">AudioVSL</h1>
            <p className="text-zinc-400 text-sm mb-0">{randomTagline}</p>
          </div>
          
          {/* Project action buttons */}
          <div className="flex gap-2">
            <button 
              onClick={saveProject}
              disabled={!mediaFile || !audioFile}
              className="px-3 py-1.5 bg-zinc-800 text-white text-sm rounded hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:hover:bg-zinc-800"
            >
              Save Project
            </button>
            <button 
              onClick={openProjectFileDialog}
              className="px-3 py-1.5 bg-zinc-800 text-white text-sm rounded hover:bg-zinc-700 transition-colors"
            >
              Load Project
            </button>
            <input 
              type="file" 
              ref={projectFileInputRef}
              onChange={handleProjectFileSelect}
              accept=".json"
              className="hidden"
            />
          </div>
        </div>
        
        <div className="w-full flex flex-col md:flex-row gap-5 h-[calc(100vh-120px)]">
          {/* Left side: Upload + Settings */}
          <div className="md:w-2/5 flex flex-col">
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div
                {...getMediaRootProps()}
                className={cn(
                  "border-dashed border-2 rounded-lg overflow-hidden transition-colors",
                  "flex flex-col items-center justify-center text-center p-3",
                  "border-white/[0.12] hover:border-white/20 hover-glow",
                  "h-[150px] col-span-3"
                )}
              >
                <input {...getMediaInputProps()} />
                {mediaFile ? (
                  mediaFile.type === 'video' ? (
                    <video 
                      ref={videoRef}
                      src={mediaFile.url} 
                      className="max-h-full max-w-full object-contain" 
                      controls 
                    />
                  ) : (
                    <img 
                      src={mediaFile.url} 
                      alt="Preview" 
                      className="max-h-full max-w-full object-contain" 
                    />
                  )
                ) : (
                  <>
                    <div className="text-foreground/40 mb-1">
                      <svg
                        className="mx-auto h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                    </div>
                    <p className="text-xs lowercase text-foreground/60">
                      drop image, gif, or video
                    </p>
                    <p className="text-xs lowercase text-foreground/40">
                      jpg, png, gif, mp4
                    </p>
                  </>
                )}
              </div>

              <div
                {...getAudioRootProps()}
                className={cn(
                  "border-dashed border-2 rounded-lg overflow-hidden transition-colors",
                  "flex flex-col items-center justify-center text-center p-3",
                  "border-white/[0.12] hover:border-white/20 hover-glow",
                  "h-[150px] col-span-1"
                )}
              >
                <input {...getAudioInputProps()} />
                {audioFile ? (
                  <div className="text-xs lowercase text-foreground/60">
                    {audioFile.file.name}
                  </div>
                ) : (
                  <>
                    <div className="text-foreground/40 mb-1">
                      <svg
                        className="mx-auto h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1}
                          d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                        />
                      </svg>
                    </div>
                    <p className="text-xs lowercase text-foreground/60">
                      audio
                    </p>
                    <p className="text-xs lowercase text-foreground/40">
                      mp3, wav
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <VideoSettings
                settings={videoSettings}
                onSettingsChange={setVideoSettings}
                syncOptions={syncOptions}
                onSyncOptionsChange={setSyncOptions}
                isVideoInput={mediaFile?.type === 'video'}
                onPreviewOffset={previewOffset}
                isPreviewPlaying={isPreviewPlaying}
                onStopPreview={stopPreview}
              />
            </div>
          </div>

          {/* Right side: Preview */}
          <div className="flex flex-col md:w-3/5">
            <div className="relative bg-surface-2 rounded-lg overflow-hidden border border-white/[0.12] hover-glow flex-1">
              <div
                ref={previewRef}
                className="absolute inset-0 flex items-center justify-center"
              >
                {mediaFile ? (
                  <div
                    className="relative flex items-center justify-center"
                    style={{
                      width: `${getPreviewDimensions().width}px`,
                      height: `${getPreviewDimensions().height}px`,
                    }}
                  >
                    {mediaFile.type === 'video' ? (
                      <video
                        src={mediaFile.url}
                        loop
                        muted
                        autoPlay
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <img
                        src={mediaFile.url}
                        alt="Preview"
                        className="w-full h-full object-contain"
                      />
                    )}
                    {videoSettings.textElements.map((element) => (
                      <TextPreview
                        key={element.id}
                        element={element}
                        containerRef={previewRef}
                        onPositionChange={(id, position) => {
                          const updatedElements = videoSettings.textElements.map((el) =>
                            el.id === id ? { ...el, position } : el
                          );
                          setVideoSettings({ ...videoSettings, textElements: updatedElements });
                        }}
                        onSizeChange={(id, size) => {
                          const updatedElements = videoSettings.textElements.map((el) =>
                            el.id === id ? { ...el, size } : el
                          );
                          setVideoSettings({ ...videoSettings, textElements: updatedElements });
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-5">
                    <div className="text-foreground/30 text-sm lowercase">
                      preview will appear here
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4">
              <button
                onClick={processMedia}
                disabled={!mediaFile || !audioFile || !loaded || processing}
                className={cn(
                  "w-full py-3 rounded-md text-sm font-medium transition-colors lowercase",
                  "hover-glow",
                  (!mediaFile || !audioFile || !loaded || processing)
                    ? "bg-white/10 text-foreground/30 cursor-not-allowed"
                    : "soft-white"
                )}
              >
                {processing ? "generating video..." : "generate video"}
              </button>

              {processing && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs lowercase mb-2">
                    <span>processing</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress.Root
                    className="h-1 w-full overflow-hidden rounded-full bg-white/[0.05]"
                    value={progress}
                  >
                    <Progress.Indicator
                      className="h-full bg-white/90"
                      style={{ width: `${progress}%` }}
                    />
                  </Progress.Root>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add the history button */}
      <HistoryButton />
      
      {/* Add keyboard shortcuts help */}
      <KeyboardShortcutsHelp />
      
      {/* Add the history panel */}
      <ExportHistoryPanel />
    </main>
  );
} 