import * as React from 'react';
import { cn } from '@/lib/utils';
import { WaveformSync } from './WaveformSync';

export interface TextElement {
  id: string;
  text: string;
  color: string;
  font: string;
  size: number;
  position: {
    x: number;
    y: number;
  };
}

export interface VideoSettings {
  aspectRatio: string;
  resolution: string;
  textElements: TextElement[];
  exportPreset?: ExportPreset;
  visualizationStyle?: VisualizationStyle;
}

export interface ExportPreset {
  name: string;
  resolution: string;
  bitrate: string;
  format: string;
}

export type VisualizationStyle = 
  | 'waveform' 
  | 'spectrum' 
  | 'circular'
  | 'bars'
  | 'particles'
  | 'none';

const EXPORT_PRESETS: ExportPreset[] = [
  {
    name: 'YouTube',
    resolution: '1920x1080',
    bitrate: '8M',
    format: 'mp4'
  },
  {
    name: 'TikTok',
    resolution: '1080x1920',
    bitrate: '5M',
    format: 'mp4'
  },
  {
    name: 'Instagram',
    resolution: '1080x1080',
    bitrate: '4M',
    format: 'mp4'
  },
  {
    name: 'Twitter',
    resolution: '1280x720',
    bitrate: '3M',
    format: 'mp4'
  },
  {
    name: 'High Quality',
    resolution: '3840x2160',
    bitrate: '20M',
    format: 'mp4'
  },
  {
    name: 'Compressed',
    resolution: '854x480',
    bitrate: '1M',
    format: 'mp4'
  }
];

const VISUALIZATION_STYLES: {id: VisualizationStyle, name: string, description: string}[] = [
  { 
    id: 'waveform', 
    name: 'Waveform', 
    description: 'Classic waveform visualization'
  },
  { 
    id: 'spectrum', 
    name: 'Spectrum', 
    description: 'Frequency spectrum analyzer'
  },
  { 
    id: 'circular', 
    name: 'Circular', 
    description: 'Circular audio visualization'
  },
  { 
    id: 'bars', 
    name: 'Bars', 
    description: 'Audio reactive bars'
  },
  { 
    id: 'particles', 
    name: 'Particles', 
    description: 'Audio reactive particles'
  },
  { 
    id: 'none', 
    name: 'None', 
    description: 'No audio visualization'
  }
];

export interface SyncOptions {
  mode: 'loop-media' | 'trim-audio' | 'stretch-audio' | 'auto-sync';
  offset?: number; // In seconds, for manual fine-tuning
}

interface VideoSettingsProps {
  settings: VideoSettings;
  onSettingsChange: (settings: VideoSettings) => void;
  syncOptions: SyncOptions;
  onSyncOptionsChange: (options: SyncOptions) => void;
  isVideoInput: boolean;
  onPreviewOffset: () => void;
  isPreviewPlaying: boolean;
  onStopPreview: () => void;
}

const defaultSettings: VideoSettings = {
  aspectRatio: '16:9',
  resolution: '720p',
  textElements: [],
};

const fontOptions = [
  'Inter',
  'Roboto Mono',
  'Playfair Display',
  'Bebas Neue',
  'Permanent Marker',
];

export function VideoSettings({ 
  settings = defaultSettings, 
  onSettingsChange,
  syncOptions,
  onSyncOptionsChange,
  isVideoInput,
  onPreviewOffset,
  isPreviewPlaying,
  onStopPreview
}: VideoSettingsProps) {
  const [syncSectionOpen, setSyncSectionOpen] = React.useState(true);
  const [syncOptionsVisible, setSyncOptionsVisible] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState('aspect');

  const handleChange = (key: keyof VideoSettings, value: any) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const addTextElement = () => {
    const newElement: TextElement = {
      id: Math.random().toString(36).substring(7),
      text: '',
      color: '#ffffff',
      font: 'Inter',
      size: 24,
      position: { x: 50, y: 50 },
    };
    handleChange('textElements', [...settings.textElements, newElement]);
  };

  const updateTextElement = (id: string, updates: Partial<TextElement>) => {
    handleChange(
      'textElements',
      settings.textElements.map((el) =>
        el.id === id ? { ...el, ...updates } : el
      )
    );
  };

  const removeTextElement = (id: string) => {
    handleChange(
      'textElements',
      settings.textElements.filter((el) => el.id !== id)
    );
  };

  const handlePresetChange = (preset: ExportPreset) => {
    onSettingsChange({
      ...settings,
      exportPreset: preset
    });
  };

  const handleVisualizationStyleChange = (style: VisualizationStyle) => {
    onSettingsChange({
      ...settings,
      visualizationStyle: style
    });
  };

  return (
    <div className="border border-white/[0.12] rounded-md p-3 bg-surface-2/80 w-full h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground/80 lowercase">settings</h3>
        <button
          onClick={addTextElement}
          className="px-2 py-1 text-xs bg-surface-3 rounded border border-white/[0.12] text-foreground/60 hover:text-foreground/80 transition-colors hover-glow"
        >
          + add text
        </button>
      </div>

      {/* Tabbed navigation for settings */}
      <div className="flex space-x-2 mb-3 border-b border-white/[0.08] pb-1.5">
        <button
          onClick={() => setActiveTab('aspect')}
          className={cn(
            "text-xs px-2.5 py-1 rounded-sm", 
            activeTab === 'aspect' 
              ? "bg-surface-3 text-foreground" 
              : "text-foreground/60 hover:text-foreground/90"
          )}
        >
          aspect
        </button>
        <button
          onClick={() => setActiveTab('text')}
          className={cn(
            "text-xs px-2.5 py-1 rounded-sm", 
            activeTab === 'text' 
              ? "bg-surface-3 text-foreground" 
              : "text-foreground/60 hover:text-foreground/90"
          )}
        >
          text ({settings.textElements.length})
        </button>
        <button
          onClick={() => setActiveTab('sync')}
          className={cn(
            "text-xs px-2.5 py-1 rounded-sm", 
            activeTab === 'sync' 
              ? "bg-surface-3 text-foreground" 
              : "text-foreground/60 hover:text-foreground/90"
          )}
        >
          sync
        </button>
      </div>

      {/* Content based on active tab */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'aspect' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-2 lowercase">
                aspect ratio
              </label>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {(['16:9', '9:16', '1:1', '4:5'] as const).map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => handleChange('aspectRatio', ratio)}
                    className={cn(
                      'px-2 py-1.5 rounded text-xs font-medium transition-colors lowercase',
                      'border border-white/[0.12]',
                      settings.aspectRatio === ratio
                        ? 'soft-white border-white/20'
                        : 'bg-surface-3 text-foreground hover:bg-surface-1 hover-glow'
                    )}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-2 lowercase">
                visualization
              </label>
              <div className="grid grid-cols-3 gap-2">
                {VISUALIZATION_STYLES.map((style) => (
                  <button
                    key={style.id}
                    onClick={() => handleVisualizationStyleChange(style.id)}
                    className={cn(
                      'px-2 py-1.5 rounded text-xs font-medium transition-colors lowercase',
                      'border border-white/[0.12]',
                      settings.visualizationStyle === style.id
                        ? 'soft-white border-white/20'
                        : 'bg-surface-3 text-foreground hover:bg-surface-1 hover-glow'
                    )}
                    title={style.description}
                  >
                    {style.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-zinc-400 mb-1">Resolution</label>
              <select
                value={settings.resolution || '720p'}
                onChange={(e) => onSettingsChange({...settings, resolution: e.target.value})}
                className="w-full p-2 bg-zinc-800 text-white rounded border border-white/[0.12]"
              >
                <option value="480p">480p (SD)</option>
                <option value="720p">720p (HD)</option>
                <option value="1080p">1080p (Full HD)</option>
                <option value="1440p">1440p (2K)</option>
                <option value="2160p">2160p (4K)</option>
              </select>
              <p className="text-xs text-zinc-400 mt-1">Higher resolution = larger file size</p>
            </div>
          </div>
        )}
        
        {activeTab === 'text' && (
          <div className="space-y-2">
            {settings.textElements.length === 0 ? (
              <div className="text-xs text-foreground/40 italic py-4 text-center">
                no text elements added
              </div>
            ) : (
              settings.textElements.map((element, index) => (
                <div key={element.id} className="bg-surface-3 rounded-md overflow-hidden text-xs">
                  <div className="flex items-center gap-2 p-2 border-b border-white/[0.08]">
                    <span className="text-[10px] font-medium text-foreground/40 lowercase">
                      {index + 1}
                    </span>
                    <input
                      type="text"
                      value={element.text}
                      onChange={(e) => updateTextElement(element.id, { text: e.target.value })}
                      placeholder="enter text..."
                      className="flex-1 px-2 py-1 text-xs bg-surface-2 rounded lowercase"
                    />
                    <button
                      onClick={() => removeTextElement(element.id)}
                      className="text-foreground/40 hover:text-foreground/60 p-1 hover:bg-surface-2 rounded transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="p-2 grid grid-cols-[auto,1fr,auto] gap-2 items-center">
                    <input
                      type="color"
                      value={element.color}
                      onChange={(e) => updateTextElement(element.id, { color: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer border border-white/[0.12] hover-glow"
                    />
                    <select
                      value={element.font}
                      onChange={(e) => updateTextElement(element.id, { font: e.target.value })}
                      className="px-2 py-1 text-xs bg-surface-2 rounded appearance-none lowercase"
                    >
                      {fontOptions.map((font) => (
                        <option key={font} value={font}>
                          {font.toLowerCase()}
                        </option>
                      ))}
                    </select>
                    <span className="text-[10px] font-medium text-foreground/40 tabular-nums w-8">
                      {element.size}px
                    </span>
                  </div>
                  <div className="px-2 pb-2">
                    <input
                      type="range"
                      min="12"
                      max="72"
                      value={element.size}
                      onChange={(e) => updateTextElement(element.id, { size: Number(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        
        {activeTab === 'sync' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-2 lowercase">
                sync mode
              </label>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-sm border border-white/[0.12]",
                    syncOptions.mode === 'loop-media' ? "soft-white border-white/20" : "text-foreground/60 hover:text-foreground/90"
                  )}
                  onClick={() => onSyncOptionsChange({ ...syncOptions, mode: 'loop-media' })}
                >
                  loop media
                </button>
                <button
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-sm border border-white/[0.12]",
                    syncOptions.mode === 'trim-audio' ? "soft-white border-white/20" : "text-foreground/60 hover:text-foreground/90"
                  )}
                  onClick={() => onSyncOptionsChange({ ...syncOptions, mode: 'trim-audio' })}
                  disabled={!isVideoInput}
                >
                  trim audio
                </button>
                <button
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-sm border border-white/[0.12]",
                    syncOptions.mode === 'stretch-audio' ? "soft-white border-white/20" : "text-foreground/60 hover:text-foreground/90"
                  )}
                  onClick={() => onSyncOptionsChange({ ...syncOptions, mode: 'stretch-audio' })}
                  disabled={!isVideoInput}
                >
                  stretch audio
                </button>
                <button
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-sm border border-white/[0.12]",
                    syncOptions.mode === 'auto-sync' ? "soft-white border-white/20" : "text-foreground/60 hover:text-foreground/90"
                  )}
                  onClick={() => onSyncOptionsChange({ ...syncOptions, mode: 'auto-sync' })}
                  disabled={!isVideoInput}
                >
                  auto-sync
                </button>
              </div>
            </div>
            
            {syncOptions.mode === 'auto-sync' && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <div className="text-xs text-foreground/70 lowercase">offset: {syncOptions.offset}s</div>
                  {isVideoInput && (
                    <div className="flex items-center">
                      {isPreviewPlaying ? (
                        <button 
                          onClick={onStopPreview}
                          className="text-xs px-2 py-1 rounded-sm bg-surface-3 text-foreground/60 hover:text-foreground/90"
                        >
                          stop
                        </button>
                      ) : (
                        <button 
                          onClick={onPreviewOffset}
                          className="text-xs px-2 py-1 rounded-sm bg-surface-3 text-foreground/60 hover:text-foreground/90"
                        >
                          preview
                        </button>
                      )}
                    </div>
                  )}
                </div>
                
                {/* WaveformSync component for visual sync adjustment */}
                {isVideoInput && window.videoUrl && window.audioUrl && (
                  <WaveformSync
                    videoSrc={window.videoUrl}
                    audioSrc={window.audioUrl}
                    offsetSeconds={syncOptions.offset || 0}
                    onOffsetChange={(offset) => onSyncOptionsChange({
                      ...syncOptions,
                      offset
                    })}
                    className="mt-2"
                    height={120}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 