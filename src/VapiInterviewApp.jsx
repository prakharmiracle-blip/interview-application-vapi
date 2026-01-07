import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Upload, Briefcase, FileText, MessageSquare, Clock, CheckCircle, Video, VideoOff, Camera } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

const VapiInterviewApp = () => {
  const [step, setStep] = useState('setup'); // setup, permissions, interview, completed
  const [jobRole, setJobRole] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState('');
  const [transcript, setTranscript] = useState([]);
  const [interviewDuration, setInterviewDuration] = useState(0);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [stream, setStream] = useState(null);
  const vapiRef = useRef(null);
  const timerRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    // Load Vapi SDK
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/gh/VapiAI/html-script-tag@latest/dist/assets/index.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      document.body.removeChild(script);
    };
  }, [stream]);
  // Set up PDF.js worker
  useEffect(() => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  }, []);

  // Debug: show Vite env var in browser console to verify it's loaded
  useEffect(() => {
    try {
      console.log('VITE_VAPI_API_KEY =', import.meta.env.VITE_VAPI_API_KEY);
      if (!import.meta.env.VITE_VAPI_API_KEY) {
        console.warn('VITE_VAPI_API_KEY is empty. Ensure .env exists and restart Vite.');
      }
    } catch (e) {
      console.error('Could not read import.meta.env:', e);
    }
  }, []);

  // Intercept fetch requests to the Vapi API to log payloads/responses for debugging
  useEffect(() => {
    if (typeof window === 'undefined' || !window.fetch) return;
    const origFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      try {
        const [resource, config] = args;
        const url = typeof resource === 'string' ? resource : resource && resource.url;
        if (url && url.includes('api.vapi.ai/call/web')) {
          console.log('--- Intercepted Vapi fetch ->', url);
          console.log('fetch config:', config);
          if (config && config.body) {
            try {
              const bodyText = typeof config.body === 'string' ? config.body : JSON.stringify(config.body);
              console.log('Request body:', bodyText);
            } catch (err) {
              console.warn('Could not stringify request body', err);
            }
          }
        }
      } catch (e) {
        console.warn('fetch interceptor error', e);
      }

      const res = await origFetch(...args);

      try {
        const resUrl = res && res.url;
        if (resUrl && resUrl.includes('api.vapi.ai/call/web')) {
          const clone = res.clone();
          clone.text().then(t => console.log('Response body:', t)).catch(() => {});
        }
      } catch (e) {
        console.warn('response read error', e);
      }

      return res;
    };

    return () => { window.fetch = origFetch; };
  }, []);

  const handleStartInterview = async () => {
    if (!jobRole || !resumeText) {
      alert('Please provide both job role and resume');
      return;
    }
    
    // Check if browser supports getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Your browser does not support camera/microphone access. Please use a modern browser like Chrome, Firefox, or Edge.');
      return;
    }
    
    setStep('permissions');
    setCallStatus('');
    
    // Automatically request permissions when entering permissions step
    setTimeout(() => {
      requestMediaPermissions();
    }, 500);
  };

  // Sanitize strings sent to Vapi API to avoid unsupported Unicode escape sequences
  const sanitizeForApi = (str) => {
    if (typeof str !== 'string') return str;
    // Escape backslashes to prevent accidental \uXXXX sequences
    return str.replace(/\\/g, '\\\\');
  };

  const requestMediaPermissions = async () => {
    try {
      setCallStatus('Requesting camera and microphone permissions...');
      
      // Request both camera and microphone access
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      setStream(mediaStream);
      setIsMicEnabled(true);
      setIsCameraEnabled(true);
      setPermissionsGranted(true);
      setCallStatus('Permissions granted! Starting interview...');

      // Attach stream to video element
      setTimeout(() => {
        if (videoRef.current && mediaStream) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 100);

      // Wait a moment then start the actual interview
      setTimeout(() => {
        startInterview();
      }, 1500);

    } catch (error) {
      console.error('Error accessing media devices:', error);
      let errorMessage = 'Could not access camera/microphone.\n\n';
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage += 'Permission denied. Please:\n';
        errorMessage += '1. Click the camera icon in your browser\'s address bar\n';
        errorMessage += '2. Allow camera and microphone access\n';
        errorMessage += '3. Click "Request Again" button';
      } else if (error.name === 'NotFoundError') {
        errorMessage += 'No camera or microphone found on your device.\n';
        errorMessage += 'Please connect a webcam and microphone.';
      } else if (error.name === 'NotReadableError') {
        errorMessage += 'Camera or microphone is already in use.\n';
        errorMessage += 'Please close other applications using your camera/mic.';
      } else {
        errorMessage += error.message;
      }
      
      alert(errorMessage);
      setCallStatus('Permission denied - Click "Request Again" to retry');
      // Don't go back to setup, stay on permissions screen
    }
  };

  const toggleCamera = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleMic = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicEnabled(audioTrack.enabled);
      }
    }
  };

const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      let extractedText = '';
      const fileType = file.type;
      const fileName = file.name.toLowerCase();

      // Handle PDF files
      if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ');
          extractedText += pageText + '\n\n';
        }
        
        setResumeText(extractedText.trim());
        alert('✓ PDF text extracted successfully!');
      } 
      // Handle DOC/DOCX files
      else if (fileName.endsWith('.doc') || fileName.endsWith('.docx') || 
               fileType === 'application/msword' || 
               fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        extractedText = result.value;
        
        setResumeText(extractedText.trim());
        alert('✓ Document text extracted successfully!');
      }
      // Handle plain text files
      else {
        const reader = new FileReader();
        reader.onload = (event) => {
          setResumeText(event.target.result);
        };
        reader.readAsText(file);
      }

    } catch (error) {
      console.error('Error extracting text:', error);
      alert('Failed to extract text from file. Please copy and paste the text manually into the textarea below.');
      setResumeText('');
    }
  };

  const generateInterviewPrompt = () => {
    return `You are an expert technical interviewer conducting a professional job interview for the position of ${jobRole}.

CANDIDATE'S RESUME:
${resumeText}

YOUR ROLE:
- Conduct a thorough, professional interview based on the candidate's resume and the job role
- Ask relevant technical and behavioral questions appropriate for ${jobRole}
- Listen carefully to responses and ask follow-up questions
- Evaluate skills, experience, and cultural fit
- Be conversational but professional
- The interview should last 10-15 minutes

INTERVIEW STRUCTURE:
1. Start with a warm greeting and brief introduction
2. Ask about their background and experience from their resume
3. Ask 3-4 technical questions relevant to ${jobRole}
4. Ask 2-3 behavioral/situational questions
5. Give them a chance to ask questions
6. Close professionally

Be natural in conversation, show active listening, and adapt questions based on their responses. Maintain a friendly but professional tone throughout.`;
  };

// Start interview flow: wrap in async function to avoid top-level await
const startInterview = async () => {
  try {
    // Wait for Vapi SDK to load properly
        let attempts = 0;
        while (typeof window.vapiSDK === 'undefined' && attempts < 10) {
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }

        if (typeof window.vapiSDK === 'undefined') {
          throw new Error('Vapi SDK failed to load. Please check your internet connection.');
        }

        // Initialize Vapi with your API key (read from environment)
        const apiKey = import.meta.env.VITE_VAPI_API_KEY || '';
        if (!apiKey || apiKey === 'YOUR_VAPI_PUBLIC_KEY') {
          throw new Error('Vapi API key not found. Create a .env file with VITE_VAPI_API_KEY=your_key and restart the dev server.');
        }

        // Prepare assistant configuration early so `run`-style SDKs can receive it
        const assistantConfig = {
          model: {
            provider: "openai",
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: sanitizeForApi(generateInterviewPrompt())
              }
            ]
          },
          voice: {
            provider: "11labs",
            voiceId: "21m00Tcm4TlvDq8ikWAM"
          },
          firstMessage: sanitizeForApi(`Hello! Thank you for taking the time to interview with us today for the ${jobRole} position. I've reviewed your resume and I'm excited to learn more about your experience. Shall we get started?`),
          transcriber: {
            provider: "deepgram",
            model: "nova-2",
            language: "en"
          }
        };

        // Log SDK export shape for debugging
        try {
          console.log('window.vapiSDK:', window.vapiSDK);
          console.log('typeof window.vapiSDK:', typeof window.vapiSDK);
          console.dir(window.vapiSDK);
        } catch (e) {
          console.error('Error logging window.vapiSDK:', e);
        }

        // Instantiate the SDK defensively — handle constructor, factory, and `run`-style exports
        let vapi;

        // If the SDK exposes a `run` method (observed export shape), call it
        let runStarted = false;
        if (window.vapiSDK && typeof window.vapiSDK.run === 'function') {
          try {
            const result = window.vapiSDK.run({ apiKey, assistant: assistantConfig });
            // `run` may return the live call object or nothing; prefer returned instance
            vapi = result || window.vapiSDK;
            runStarted = true;
          } catch (e) {
            throw new Error('Failed to start Vapi via window.vapiSDK.run(): ' + e.message);
          }

        } else {
          try {
            // Try constructor form
            vapi = new window.vapiSDK(apiKey);
          } catch (e) {
            try {
              // Try calling as a factory function
              vapi = window.vapiSDK(apiKey);
            } catch (e2) {
              // Try common export shapes
              if (window.vapiSDK && typeof window.vapiSDK.create === 'function') {
                vapi = window.vapiSDK.create(apiKey);
              } else if (window.vapiSDK && window.vapiSDK.default) {
                try {
                  vapi = new window.vapiSDK.default(apiKey);
                } catch (e3) {
                  vapi = window.vapiSDK.default(apiKey);
                }
              } else {
                throw new Error('Unsupported Vapi SDK export shape: ' + String(window.vapiSDK));
              }
            }
          }
        }

        vapiRef.current = vapi;

        setCallStatus('Connecting to AI interviewer...');

        // Start the actual Vapi call if SDK instance supports it (skip if run() already started)
        if (!runStarted) {
          if (vapi && typeof vapi.start === 'function') {
            await vapi.start(assistantConfig);
          } else if (typeof vapi === 'function') {
            // Some SDKs are callable; attempt to call with assistantConfig
            try { vapi(assistantConfig); } catch (e) { console.warn('vapi callable invocation failed:', e); }
          }
        }

        // Set up event listeners for real-time updates
        vapi.on('call-start', () => {
          setIsCallActive(true);
          setCallStatus('Interview in progress...');

          // Start timer
          timerRef.current = setInterval(() => {
            setInterviewDuration(prev => prev + 1);
          }, 1000);
        });

        vapi.on('call-end', () => {
          endInterview();
        });

        vapi.on('message', (message) => {
          console.log('Vapi message:', message);

          // Add to transcript when we get transcriptions
          if (message.type === 'transcript') {
            if (message.role === 'assistant') {
              addToTranscript('Interviewer', message.transcript);
            } else if (message.role === 'user') {
              addToTranscript('You', message.transcript);
            }
          }
        });

        vapi.on('error', (error) => {
          console.error('Vapi error:', error);
          setCallStatus('Error: ' + error.message);
          alert('Vapi Error: ' + error.message);
        });

        // Note: You'll need to replace 'YOUR_VAPI_PUBLIC_KEY' with your actual Vapi public key
        // Get it from https://vapi.ai
        setCallStatus('Connecting...');

        // Start timer (fallback)
        timerRef.current = setInterval(() => {
          setInterviewDuration(prev => prev + 1);
        }, 1000);

        setIsCallActive(true);
        setCallStatus('Interview in progress...');

        // Simulate transcript updates (in real implementation, this comes from Vapi events)
        addToTranscript('Interviewer', `Hello! Thank you for taking the time to interview with us today for the ${jobRole} position.`);

      } catch (error) {
        console.error('Error starting interview:', error);
        setCallStatus('Error: Could not start interview');
        alert('Error starting interview. Please ensure Vapi SDK is properly configured with your API key.');
      }
    };

  const endInterview = () => {
    if (vapiRef.current && isCallActive) {
      // End the Vapi call
      // vapiRef.current.stop();
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    // Stop media tracks
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    
    setIsCallActive(false);
    setIsMicEnabled(false);
    setIsCameraEnabled(false);
    setPermissionsGranted(false);
    setStep('completed');
    setCallStatus('Interview completed');
  };

  const addToTranscript = (speaker, text) => {
    setTranscript(prev => [...prev, { speaker, text, timestamp: new Date() }]);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const resetInterview = () => {
    setStep('setup');
    setJobRole('');
    setResumeText('');
    setIsCallActive(false);
    setCallStatus('');
    setTranscript([]);
    setInterviewDuration(0);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center gap-3">
            <Briefcase className="w-8 h-8 text-indigo-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-800">AI Interview Assistant</h1>
              <p className="text-gray-600">Powered by Vapi - Intelligent Voice AI</p>
            </div>
          </div>
        </div>

        {/* Setup Step */}
        {step === 'setup' && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Setup Interview</h2>
            
            {/* Job Role Input */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <Briefcase className="w-4 h-4 inline mr-2" />
                Job Role
              </label>
              <input
                type="text"
                value={jobRole}
                onChange={(e) => setJobRole(e.target.value)}
                placeholder="e.g., Senior Frontend Developer, Data Scientist, Product Manager"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Resume Upload */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <FileText className="w-4 h-4 inline mr-2" />
                Resume/CV
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-indigo-500 transition-colors">
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <label className="cursor-pointer">
                  <span className="text-indigo-600 font-semibold hover:text-indigo-700">
                    Upload resume
                  </span>
                  <span className="text-gray-600"> or paste text below</span>
                  <input
                    type="file"
                    accept=".txt,.pdf,.doc,.docx"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
              <textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste resume content here..."
                rows="8"
                className="w-full mt-3 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Start Button */}
            <button
              onClick={handleStartInterview}
              disabled={!jobRole || !resumeText}
              className="w-full bg-indigo-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <Mic className="w-5 h-5" />
              Start Interview
            </button>

            {/* Info Box */}
            <div className="mt-6 bg-indigo-50 border border-indigo-200 rounded-lg p-4">
              <h3 className="font-semibold text-indigo-900 mb-2">How it works:</h3>
              <ul className="text-sm text-indigo-800 space-y-1">
                <li>• AI will conduct a professional interview based on the job role</li>
                <li>• Questions will be tailored to the candidate's resume</li>
                <li>• Interview typically lasts 10-15 minutes</li>
                <li>• All conversations are transcribed in real-time</li>
              </ul>
            </div>
          </div>
        )}

        {/* Permissions Step */}
        {step === 'permissions' && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="text-center mb-8">
              <Camera className="w-20 h-20 text-indigo-600 mx-auto mb-4 animate-pulse" />
              <h2 className="text-3xl font-bold text-gray-800 mb-2">Camera & Microphone Access</h2>
              <p className="text-gray-600">Please allow camera and microphone access in your browser</p>
            </div>

            {/* Video Preview */}
            <div className="mb-6 bg-gray-900 rounded-lg overflow-hidden relative" style={{ height: '400px' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {!permissionsGranted && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                  <div className="text-center p-8">
                    <div className="relative">
                      <Camera className="w-20 h-20 text-gray-400 mx-auto mb-4" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-24 h-24 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    </div>
                    <p className="text-gray-300 text-lg mb-2 font-semibold">Requesting permissions...</p>
                    <p className="text-gray-400 text-sm">Look for the permission popup in your browser</p>
                    <p className="text-gray-500 text-xs mt-2">(Usually appears at the top of the page)</p>
                  </div>
                </div>
              )}
            </div>

            {/* Status */}
            {callStatus && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
                <p className="text-indigo-800 text-center font-semibold flex items-center justify-center gap-2">
                  <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse"></div>
                  {callStatus}
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4">
              {!permissionsGranted && (
                <button
                  onClick={requestMediaPermissions}
                  className="flex-1 bg-indigo-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Camera className="w-5 h-5" />
                  Request Again
                </button>
              )}
              <button
                onClick={() => {
                  if (stream) {
                    stream.getTracks().forEach(track => track.stop());
                    setStream(null);
                  }
                  setStep('setup');
                  setPermissionsGranted(false);
                  setCallStatus('');
                }}
                className="px-6 py-4 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>

            {/* Info */}
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">📌 Permission Popup Not Showing?</h3>
              <ul className="text-sm text-blue-800 space-y-2">
                <li>• <strong>Check the address bar:</strong> Look for a camera/microphone icon</li>
                <li>• <strong>Browser settings:</strong> Ensure camera/mic aren't blocked for this site</li>
                <li>• <strong>Click "Request Again"</strong> if the popup was accidentally closed</li>
                <li>• <strong>Try a different browser</strong> if issues persist (Chrome works best)</li>
              </ul>
            </div>

            <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-semibold text-green-900 mb-2">Why we need these permissions:</h3>
              <ul className="text-sm text-green-800 space-y-1">
                <li>• <strong>Camera:</strong> To simulate a real face-to-face interview experience</li>
                <li>• <strong>Microphone:</strong> To hear your responses and conduct voice conversation</li>
                <li>• Your privacy is important - we don't record or store video/audio</li>
              </ul>
            </div>
          </div>
        )}

        {/* Interview Step */}
        {step === 'interview' && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Interview in Progress</h2>
                <p className="text-gray-600">Position: {jobRole}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock className="w-5 h-5" />
                  <span className="font-mono text-lg">{formatTime(interviewDuration)}</span>
                </div>
                {isCallActive && (
                  <div className="flex items-center gap-2 text-green-600">
                    <div className="w-3 h-3 bg-green-600 rounded-full animate-pulse" />
                    <span className="font-semibold">Live</span>
                  </div>
                )}
              </div>
            </div>

            {/* Video Preview */}
            <div className="mb-6 bg-gray-900 rounded-lg overflow-hidden relative" style={{ height: '400px' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {!isCameraEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                  <div className="text-center">
                    <VideoOff className="w-16 h-16 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-300">Camera is off</p>
                  </div>
                </div>
              )}
              
              {/* Video Controls Overlay */}
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-3">
                <button
                  onClick={toggleMic}
                  className={`p-4 rounded-full transition-colors ${
                    isMicEnabled 
                      ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                  title={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
                >
                  {isMicEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                </button>
                
                <button
                  onClick={toggleCamera}
                  className={`p-4 rounded-full transition-colors ${
                    isCameraEnabled 
                      ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                  title={isCameraEnabled ? 'Turn off camera' : 'Turn on camera'}
                >
                  {isCameraEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                </button>
              </div>

              {/* Status Badge */}
              <div className="absolute top-4 left-4 flex gap-2">
                {isMicEnabled && (
                  <div className="bg-green-600 text-white px-3 py-1 rounded-full text-sm flex items-center gap-1">
                    <Mic className="w-3 h-3" />
                    Mic On
                  </div>
                )}
                {isCameraEnabled && (
                  <div className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm flex items-center gap-1">
                    <Camera className="w-3 h-3" />
                    Camera On
                  </div>
                )}
              </div>
            </div>

            {/* Status */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
              <p className="text-gray-700 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-indigo-600" />
                {callStatus}
              </p>
            </div>

            {/* Transcript */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6 h-64 overflow-y-auto">
              <h3 className="font-semibold text-gray-700 mb-3">Live Transcript</h3>
              {transcript.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Waiting for conversation to start...</p>
              ) : (
                <div className="space-y-3">
                  {transcript.map((item, idx) => (
                    <div key={idx} className={`p-3 rounded-lg ${item.speaker === 'Interviewer' ? 'bg-indigo-50' : 'bg-white border border-gray-200'}`}>
                      <p className="font-semibold text-sm text-gray-700 mb-1">{item.speaker}</p>
                      <p className="text-gray-800">{item.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Control Buttons */}
            <div className="flex gap-4">
              <button
                onClick={endInterview}
                className="flex-1 bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
              >
                <MicOff className="w-5 h-5" />
                End Interview
              </button>
            </div>

            {/* Setup Instructions */}
            <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="font-semibold text-yellow-900 mb-2">⚙️ Configuration Required:</h3>
              <p className="text-sm text-yellow-800">
                To activate voice calls, you need to:
                <br />1. Sign up at <a href="https://vapi.ai" target="_blank" className="underline">vapi.ai</a>
                <br />2. Get your Public API Key
                <br />3. Add it to the code in the startInterview function
                <br />4. The AI will then conduct live voice interviews!
              </p>
            </div>
          </div>
        )}

        {/* Completed Step */}
        {step === 'completed' && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="text-center mb-8">
              <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-gray-800 mb-2">Interview Completed!</h2>
              <p className="text-gray-600">Duration: {formatTime(interviewDuration)}</p>
            </div>

            {/* Interview Summary */}
            <div className="bg-gray-50 rounded-lg p-6 mb-6">
              <h3 className="font-semibold text-gray-800 mb-3">Interview Details</h3>
              <div className="space-y-2 text-gray-700">
                <p><span className="font-semibold">Position:</span> {jobRole}</p>
                <p><span className="font-semibold">Total Messages:</span> {transcript.length}</p>
                <p><span className="font-semibold">Duration:</span> {formatTime(interviewDuration)}</p>
              </div>
            </div>

            {/* Full Transcript */}
            <div className="bg-gray-50 rounded-lg p-6 mb-6 max-h-96 overflow-y-auto">
              <h3 className="font-semibold text-gray-800 mb-3">Full Transcript</h3>
              <div className="space-y-3">
                {transcript.map((item, idx) => (
                  <div key={idx} className={`p-3 rounded-lg ${item.speaker === 'Interviewer' ? 'bg-indigo-50' : 'bg-white border border-gray-200'}`}>
                    <p className="font-semibold text-sm text-gray-700 mb-1">{item.speaker}</p>
                    <p className="text-gray-800">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={resetInterview}
                className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
              >
                Start New Interview
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VapiInterviewApp;
