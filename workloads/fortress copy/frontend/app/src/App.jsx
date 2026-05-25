import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Upload, Shield, Play, CheckCircle, AlertCircle, Loader2, Video, FileText, History, Clock, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const formatTimestamp = (seconds) => {
  if (seconds === undefined || seconds === null) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const parseAnalysis = (text) => {
  if (!text) return { objects: [], weapons: [] };

  const objects = [];
  const weapons = [];

  const isCoordinate = (line) => {
    // Matches patterns like [0.39, 0.63, 0.46, 0.69] or 0.39, 0.63, 0.46, 0.69
    return /^\[?\d*\.?\d+,\s*\d*\.?\d+,\s*\d*\.?\d+,\s*\d*\.?\d+\]?$/.test(line.trim());
  };

  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Clean the line (remove bullet points and old headers)
    const cleaned = trimmed.replace(/^[*-]\s*/, '').replace(/^OBJECTS:|^WEAPONS:/i, '').trim();
    if (!cleaned || isCoordinate(cleaned)) continue;

    // Keyword-based sorting
    if (cleaned.toLowerCase().includes('weapon')) {
      weapons.push(cleaned);
    } else {
      objects.push(cleaned);
    }
  }

  return { objects, weapons };
};

const extractObjects = (results) => {
  if (!results || !results.frame_results) return [];

  const keywords = [
    'person', 'people', 'man', 'woman', 'child', 'soldier',
    'car', 'truck', 'vehicle', 'tank', 'bicycle', 'motorcycle',
    'tree', 'forest', 'bush', 'plant', 'grass',
    'building', 'house', 'road', 'street', 'sky', 'cloud',
    'weapon', 'gun', 'rifle', 'pistol', 'knife',
    'bird', 'animal', 'dog', 'cat'
  ];

  const foundObjects = new Set();

  results.frame_results.forEach(res => {
    if (!res.analysis) return;
    const text = res.analysis.toLowerCase();

    keywords.forEach(keyword => {
      // Use word boundary to avoid partial matches (e.g., 'car' in 'scar')
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(text)) {
        foundObjects.add(keyword);
      }
    });
  });

  return Array.from(foundObjects).sort();
};

const THREAT_KEYWORDS = [
  // Weapons
  { label: 'gun', category: 'Firearm' },
  { label: 'rifle', category: 'Firearm' },
  { label: 'pistol', category: 'Firearm' },
  { label: 'firearm', category: 'Firearm' },
  { label: 'weapon', category: 'Weapon' },
  { label: 'knife', category: 'Weapon' },
  { label: 'sword', category: 'Weapon' },
  // Artillery
  { label: 'cannon', category: 'Artillery' },
  { label: 'artillery', category: 'Artillery' },
  { label: 'missile', category: 'Artillery' },
  { label: 'rocket', category: 'Artillery' },
  { label: 'mortar', category: 'Artillery' },
  // Military Vehicles
  { label: 'tank', category: 'Military Vehicle' },
  { label: 'helicopter', category: 'Military Vehicle' },
  { label: 'military vehicle', category: 'Military Vehicle' },
  { label: 'armored', category: 'Military Vehicle' },
  { label: 'warplane', category: 'Military Vehicle' },
  { label: 'fighter jet', category: 'Military Vehicle' },
  // Personnel
  { label: 'soldier', category: 'Armed Personnel' },
  { label: 'combatant', category: 'Armed Personnel' },
  { label: 'militant', category: 'Armed Personnel' },
];

const extractThreats = (results) => {
  if (!results || !results.frame_results) return [];

  const found = new Map();

  results.frame_results.forEach(res => {
    if (!res.analysis) return;
    const text = res.analysis.toLowerCase();

    THREAT_KEYWORDS.forEach(({ label, category }) => {
      const regex = new RegExp(`\\b${label}\\b`, 'i');
      if (regex.test(text) && !found.has(label)) {
        found.set(label, category);
      }
    });
  });

  return Array.from(found.entries()).map(([label, category]) => ({ label, category }));
};

function App() {
  const [file, setFile] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(null);

  const fetchHistory = async () => {
    try {
      const response = await axios.get(`${API_URL}/jobs`);
      setHistory(response.data);
    } catch (err) {
      console.error('Failed to fetch history', err);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleUpload = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setLoading(true);
    setError(null);
    setResults(null);
    setJobId(null);
    setSelectedJobId(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await axios.post(`${API_URL}/upload`, formData);
      setJobId(response.data.job_id);
      setSelectedJobId(response.data.job_id);
      fetchHistory();
    } catch (err) {
      setError('Upload failed. Ensure the backend is running.');
      setLoading(false);
    }
  };

  const selectJob = async (id) => {
    setSelectedJobId(id);
    setResults(null);
    setError(null);
    try {
      const res = await axios.get(`${API_URL}/status/${id}`);
      setStatus(res.data);
      if (res.data.status === 'done') {
        const resultsRes = await axios.get(`${API_URL}/results/${id}`);
        setResults(resultsRes.data);
      } else if (res.data.status === 'error') {
        setError(res.data.error || 'Processing failed');
      }
    } catch (err) {
      console.error('Failed to fetch job details', err);
    }
  };

  useEffect(() => {
    let interval;
    if (selectedJobId && (!status || (status.status !== 'done' && status.status !== 'error'))) {
      interval = setInterval(async () => {
        try {
          const res = await axios.get(`${API_URL}/status/${selectedJobId}`);
          setStatus(res.data);

          if (res.data.status === 'done') {
            const resultsRes = await axios.get(`${API_URL}/results/${selectedJobId}`);
            setResults(resultsRes.data);
            setLoading(false);
            clearInterval(interval);
            fetchHistory();
          } else if (res.data.status === 'error') {
            setError(res.data.error || 'Processing failed');
            setLoading(false);
            clearInterval(interval);
            fetchHistory();
          }
        } catch (err) {
          console.error('Polling error', err);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [selectedJobId, status]);

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto flex flex-col lg:flex-row gap-8">
      {/* Sidebar: History */}
      <aside className="lg:w-80 space-y-6 shrink-0">
        <header className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight gradient-text">Fortress by Google</h1>
            <p className="text-slate-400 text-xs">Video Intelligence</p>
          </div>
        </header>

        <section className="glass rounded-3xl p-6 overflow-hidden flex flex-col h-[calc(100vh-12rem)]">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2 text-slate-300">
            <History className="w-4 h-4 text-blue-400" />
            Analysis History
          </h2>
          <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar">
            {history.map((job) => (
              <button
                key={job.job_id}
                onClick={() => selectJob(job.job_id)}
                className={`w-full text-left p-3 rounded-2xl transition-all border ${selectedJobId === job.job_id
                  ? 'bg-blue-600/20 border-blue-500/50'
                  : 'bg-slate-800/30 border-white/5 hover:bg-slate-800/50'
                  }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs font-medium truncate max-w-[140px] text-slate-200">
                    {job.filename}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${job.status === 'done' ? 'bg-green-500/20 text-green-400' :
                    job.status === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                    }`}>
                    {job.status}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                  <Clock className="w-3 h-3" />
                  {new Date(job.created_at * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </button>
            ))}
            {history.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-8">No history yet</p>
            )}
          </div>
        </section>
      </aside>

      {/* Main Content */}
      <main className="flex-1 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Upload & Status */}
          <div className="lg:col-span-1 space-y-6">
            <section className="glass rounded-3xl p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-400" />
                Analyze Video
              </h2>

              <label className="upload-zone rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer text-center">
                <input type="file" className="hidden" onChange={handleUpload} accept="video/*" />
                <Video className="w-12 h-12 text-slate-500 mb-4" />
                <p className="text-sm text-slate-300 font-medium">Click to upload</p>
                <p className="text-xs text-slate-500 mt-2">MP4, AVI, MKV</p>
              </label>

              {file && !selectedJobId && (
                <div className="mt-4 p-3 bg-slate-800/50 rounded-xl flex items-center gap-3">
                  <Play className="w-4 h-4 text-blue-400" />
                  <span className="text-sm truncate">{file.name}</span>
                </div>
              )}
            </section>

            {/* Status Card */}
            <AnimatePresence>
              {selectedJobId && (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass rounded-3xl p-6"
                >
                  <h2 className="text-lg font-semibold mb-4">Processing Status</h2>
                  <div className="space-y-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Job ID</span>
                      <span className="font-mono text-xs text-blue-400">{selectedJobId.slice(0, 8)}...</span>
                    </div>

                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">State</span>
                      <span className={`capitalize font-medium ${status?.status === 'done' ? 'text-green-400' :
                        status?.status === 'error' ? 'text-red-400' : 'text-blue-400'
                        }`}>
                        {status?.status || 'Queued'}
                      </span>
                    </div>

                    {status?.total_frames && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>Analysis Progress</span>
                          <span>{status.processed_frames} / {status.total_frames} frames</span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-blue-500"
                            initial={{ width: 0 }}
                            animate={{ width: `${(status.processed_frames / status.total_frames) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {(status?.status === 'queued' || status?.status === 'processing') && (
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>VLM is analyzing frames...</span>
                      </div>
                    )}
                  </div>
                </motion.section>
              )}

              {results && (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass rounded-3xl p-6"
                >
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-blue-400" />
                    Object Detection
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {extractObjects(results).map((obj, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-xs font-medium text-blue-300 capitalize"
                      >
                        {obj}
                      </span>
                    ))}
                    {extractObjects(results).length === 0 && (
                      <p className="text-slate-500 text-sm italic">No specific objects identified</p>
                    )}
                  </div>
                </motion.section>
              )}

              {results && (() => {
                const threats = extractThreats(results);
                const hasThreats = threats.length > 0;
                return (
                  <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`rounded-3xl p-6 border ${hasThreats
                      ? 'bg-red-500/10 border-red-500/30 shadow-lg shadow-red-500/10'
                      : 'glass border-white/5'
                      }`}
                  >
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <AlertCircle className={`w-5 h-5 ${hasThreats ? 'text-red-400' : 'text-slate-400'}`} />
                      Threat Detection
                      {hasThreats && (
                        <span className="ml-auto text-xs font-bold uppercase text-red-400 animate-pulse">
                          ⚠ Threats Identified
                        </span>
                      )}
                    </h2>
                    {hasThreats ? (
                      <div className="space-y-2">
                        {threats.map(({ label, category }, idx) => (
                          <div key={idx} className="flex items-center justify-between">
                            <span className="px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full text-xs font-medium text-red-300 capitalize">
                              {label}
                            </span>
                            <span className="text-xs text-slate-500">{category}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-green-400 text-sm">
                        <CheckCircle className="w-4 h-4" />
                        <span>No threats detected</span>
                      </div>
                    )}
                  </motion.section>
                );
              })()}
            </AnimatePresence>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                <p className="text-sm text-red-200">{error}</p>
              </div>
            )}
          </div>

          {/* Right Column: Video & Results */}
          <div className="lg:col-span-2 space-y-6">
            {/* Video Player */}
            <AnimatePresence>
              {selectedJobId && status?.status === 'done' && (
                <motion.section
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="glass rounded-3xl overflow-hidden"
                >
                  <video
                    controls
                    className="w-full aspect-video bg-black"
                    src={`${API_URL}/video/${selectedJobId}`}
                  >
                    Your browser does not support the video tag.
                  </video>
                </motion.section>
              )}
            </AnimatePresence>

            <section className="glass rounded-3xl p-8 min-h-[400px]">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                <FileText className="w-6 h-6 text-blue-400" />
                Analysis Results
              </h2>

              {!results && !loading && !selectedJobId && (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                  <Shield className="w-16 h-16 mb-4 opacity-20" />
                  <p>Upload a video or select from history to begin</p>
                </div>
              )}

              {status?.status === 'processing' && !status?.total_frames && (
                <div className="flex flex-col items-center justify-center h-64">
                  <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                  <p className="text-slate-400">Extracting keyframes...</p>
                </div>
              )}

              <div className="space-y-6">
                {results?.frame_results?.map((res, i) => (
                  (() => {
                    const { objects, weapons } = parseAnalysis(res.analysis);
                    const hasWeapon = weapons.some(w => !w.toLowerCase().includes('no weapons detected'));
                    return (
                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        key={i}
                        className={`p-6 rounded-2xl border transition-all ${hasWeapon ? 'bg-red-500/10 border-red-500/50 shadow-lg shadow-red-500/10' : 'bg-slate-800/30 border-white/5 hover:border-blue-500/30'}`}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-1 ${hasWeapon ? 'bg-red-500 text-white' : 'bg-blue-500/20 text-blue-400'} text-xs font-bold rounded flex items-center gap-1`}>
                              <Clock className="w-3 h-3" />
                              {formatTimestamp(res.timestamp)}
                            </span>
                            <span className="text-xs text-slate-500">Frame {res.frame_index}</span>
                          </div>
                          {hasWeapon && (
                            <span className="flex items-center gap-1 text-red-500 text-xs font-bold uppercase animate-pulse">
                              <AlertCircle className="w-4 h-4" />
                              Weapon Detected
                            </span>
                          )}
                        </div>

                        <div className="space-y-2">
                          {res.analysis?.split('\n').filter(line => line.trim()).map((line, idx) => (
                            <div key={idx} className="text-slate-200 text-sm flex gap-3 items-start group">
                              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500/50 group-hover:bg-blue-400 transition-colors shrink-0" />
                              <p className="leading-relaxed">
                                {line.replace(/^[*-]\s*/, '')}
                              </p>
                            </div>
                          ))}
                          {!res.analysis && !res.error && (
                            <p className="text-slate-500 text-sm italic">No objects detected</p>
                          )}
                          {res.error && (
                            <p className="text-red-400 text-sm flex items-center gap-2">
                              <AlertCircle className="w-4 h-4" />
                              {res.error}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })()
                ))}
              </div>

              {results && (
                <div className="mt-8 flex items-center gap-2 text-green-400 text-sm font-medium">
                  <CheckCircle className="w-5 h-5" />
                  Analysis complete. {results.total_frames} frames processed in {results.duration_seconds}s.
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
