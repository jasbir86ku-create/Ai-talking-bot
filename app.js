/**
 * Gemini Voice AI - Interactive Dual-Voice Chatbot Engine
 * Features: Gemini 2.0 Flash Integration, Male/Female Dynamic TTS, 
 * Web Speech Recognition, Canvas Audio Visualizer, Glassmorphism UI.
 */

// ==========================================================================
// 1. Gemini AI API Service
// ==========================================================================
class GeminiService {
    constructor() {
        this.apiKey = localStorage.getItem('gemini_api_key') || '';
        this.selectedModel = localStorage.getItem('gemini_model') || 'gemini-2.0-flash';
        this.conversationHistory = [];
        this.systemInstruction = `You are a warm, intelligent, and natural Voice AI assistant powered by Google Gemini. 
Keep your answers brief, clear, conversational, and direct (preferably 1 to 3 short sentences), as your response will be read aloud to the user using text-to-speech. Avoid markdown formatting like heavy asterisks or tables unless specifically requested.`;
    }

    setApiKey(key) {
        this.apiKey = key.trim();
        localStorage.setItem('gemini_api_key', this.apiKey);
    }

    setModel(model) {
        this.selectedModel = model;
        localStorage.setItem('gemini_model', model);
    }

    hasApiKey() {
        return Boolean(this.apiKey && this.apiKey.length > 5);
    }

    clearHistory() {
        this.conversationHistory = [];
    }

    async generateResponse(userText) {
        if (!this.hasApiKey()) {
            throw new Error("Gemini API Key is missing. Please click the 'API Key' button to configure your key.");
        }

        // Add User Message to History
        this.conversationHistory.push({
            role: 'user',
            parts: [{ text: userText }]
        });

        // Endpoint construction
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.selectedModel}:generateContent?key=${this.apiKey}`;

        const requestBody = {
            contents: this.conversationHistory,
            systemInstruction: {
                parts: [{ text: this.systemInstruction }]
            },
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 250,
                topP: 0.9
            }
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errMsg = errorData.error?.message || `API HTTP Error ${response.status}`;
                throw new Error(errMsg);
            }

            const data = await response.json();
            const candidate = data.candidates?.[0];
            const aiText = candidate?.content?.parts?.[0]?.text;

            if (!aiText) {
                throw new Error("Received an empty response from Gemini API.");
            }

            // Append AI response to context history
            this.conversationHistory.push({
                role: 'model',
                parts: [{ text: aiText }]
            });

            return aiText.trim();
        } catch (error) {
            // Remove failing user prompt from history to keep state synchronized
            this.conversationHistory.pop();
            console.error("Gemini API Error:", error);
            throw error;
        }
    }
}

// ==========================================================================
// 2. Speech Synthesis Service (TTS - Male / Female Voice Persona)
// ==========================================================================
class SpeechSynthesisService {
    constructor() {
        this.synth = window.speechSynthesis;
        this.voices = [];
        this.currentGender = 'female'; // 'female' or 'male'
        this.selectedVoice = null;
        this.pitch = 1.2; // Female pitch default
        this.rate = 1.0;
        this.onStartCallback = null;
        this.onEndCallback = null;

        this.initVoices();
    }

    initVoices() {
        if (!this.synth) {
            console.warn("Web SpeechSynthesis API is not supported in this browser.");
            return;
        }

        const loadVoices = () => {
            this.voices = this.synth.getVoices();
            this.autoSelectVoiceForGender(this.currentGender);
        };

        loadVoices();
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = loadVoices;
        }
    }

    setGender(gender) {
        this.currentGender = gender;
        if (gender === 'female') {
            this.pitch = 1.2;
        } else {
            this.pitch = 0.85;
        }
        this.autoSelectVoiceForGender(gender);
    }

    autoSelectVoiceForGender(gender) {
        if (!this.voices || this.voices.length === 0) return;

        const englishVoices = this.voices.filter(v => v.lang.startsWith('en'));
        const pool = englishVoices.length > 0 ? englishVoices : this.voices;

        const maleKeywords = ['male', 'david', 'george', 'mark', 'james', 'alex', 'daniel', 'richard', 'brian', 'guy'];
        const femaleKeywords = ['female', 'zira', 'hazel', 'samantha', 'victoria', 'karen', 'fiona', 'google us english', 'jenny', 'aria'];

        let matched = null;

        if (gender === 'male') {
            matched = pool.find(v => maleKeywords.some(kw => v.name.toLowerCase().includes(kw))) ||
                      pool.find(v => !femaleKeywords.some(kw => v.name.toLowerCase().includes(kw)));
        } else {
            matched = pool.find(v => femaleKeywords.some(kw => v.name.toLowerCase().includes(kw))) ||
                      pool.find(v => !maleKeywords.some(kw => v.name.toLowerCase().includes(kw)));
        }

        this.selectedVoice = matched || pool[0];
    }

    getVoicesForGender(gender) {
        if (!this.voices || this.voices.length === 0) return [];
        return this.voices.filter(v => v.lang.startsWith('en'));
    }

    speak(text, onStart, onEnd) {
        if (!this.synth) return;

        // Cancel active speech
        this.stop();

        // Strip basic markdown formatting for clean spoken delivery
        const cleanText = text.replace(/[*#_`~]/g, '');

        const utterance = new SpeechSynthesisUtterance(cleanText);
        if (this.selectedVoice) {
            utterance.voice = this.selectedVoice;
        }

        utterance.pitch = parseFloat(this.pitch);
        utterance.rate = parseFloat(this.rate);

        utterance.onstart = () => {
            if (onStart) onStart();
            if (this.onStartCallback) this.onStartCallback();
        };

        utterance.onend = () => {
            if (onEnd) onEnd();
            if (this.onEndCallback) this.onEndCallback();
        };

        utterance.onerror = (err) => {
            console.error("Speech Synthesis Error:", err);
            if (onEnd) onEnd();
            if (this.onEndCallback) this.onEndCallback();
        };

        this.synth.speak(utterance);
    }

    stop() {
        if (this.synth && this.synth.speaking) {
            this.synth.cancel();
        }
    }

    isSpeaking() {
        return Boolean(this.synth && this.synth.speaking);
    }
}

// ==========================================================================
// 3. Speech Recognition Service (STT - Voice Input)
// ==========================================================================
class VoiceRecognitionService {
    constructor() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.isSupported = Boolean(SpeechRecognition);
        this.recognition = this.isSupported ? new SpeechRecognition() : null;
        this.isListening = false;

        this.onResultCallback = null;
        this.onInterimCallback = null;
        this.onEndCallback = null;
        this.onErrorCallback = null;

        if (this.isSupported) {
            this.recognition.continuous = false;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';

            this.setupEvents();
        }
    }

    setupEvents() {
        if (!this.recognition) return;

        this.recognition.onstart = () => {
            this.isListening = true;
        };

        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            if (interimTranscript && this.onInterimCallback) {
                this.onInterimCallback(interimTranscript);
            }

            if (finalTranscript && this.onResultCallback) {
                this.onResultCallback(finalTranscript);
            }
        };

        this.recognition.onerror = (event) => {
            console.error("Speech Recognition Error:", event.error);
            this.isListening = false;
            if (this.onErrorCallback) {
                this.onErrorCallback(event.error);
            }
        };

        this.recognition.onend = () => {
            this.isListening = false;
            if (this.onEndCallback) {
                this.onEndCallback();
            }
        };
    }

    start() {
        if (!this.isSupported) {
            throw new Error("Speech recognition is not supported in this browser. Try Google Chrome or Microsoft Edge.");
        }
        if (this.isListening) return;

        try {
            this.recognition.start();
        } catch (e) {
            console.warn("Recognition start error:", e);
        }
    }

    stop() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
            this.isListening = false;
        }
    }
}

// ==========================================================================
// 4. Interactive Canvas Audio Visualizer
// ==========================================================================
class CanvasAudioVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.state = 'idle'; // 'idle', 'listening', 'thinking', 'speaking'
        this.animationFrame = null;
        this.phase = 0;
        this.particles = [];

        this.initParticles();
        this.startLoop();
    }

    initParticles() {
        this.particles = [];
        for (let i = 0; i < 35; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                radius: Math.random() * 2.5 + 1,
                alpha: Math.random() * 0.5 + 0.2,
                speedX: (Math.random() - 0.5) * 0.6,
                speedY: (Math.random() - 0.5) * 0.6
            });
        }
    }

    setState(newState) {
        this.state = newState;
    }

    startLoop() {
        const render = () => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.phase += 0.04;

            // Draw Background Floating Particles
            this.drawParticles();

            // Draw Central Orb / Waveform depending on state
            const centerX = this.canvas.width / 2;
            const centerY = this.canvas.height / 2;

            if (this.state === 'idle') {
                this.drawIdleOrb(centerX, centerY);
            } else if (this.state === 'listening') {
                this.drawListeningWaves(centerX, centerY);
            } else if (this.state === 'thinking') {
                this.drawThinkingOrb(centerX, centerY);
            } else if (this.state === 'speaking') {
                this.drawSpeakingWave(centerX, centerY);
            }

            this.animationFrame = requestAnimationFrame(render);
        };
        render();
    }

    drawParticles() {
        this.particles.forEach(p => {
            p.x += p.speedX;
            p.y += p.speedY;

            if (p.x < 0) p.x = this.canvas.width;
            if (p.x > this.canvas.width) p.x = 0;
            if (p.y < 0) p.y = this.canvas.height;
            if (p.y > this.canvas.height) p.y = 0;

            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(0, 242, 254, ${p.alpha * 0.4})`;
            this.ctx.fill();
        });
    }

    drawIdleOrb(cx, cy) {
        const radius = 55 + Math.sin(this.phase * 0.8) * 4;

        // Glowing Gradient Orb
        const grad = this.ctx.createRadialGradient(cx, cy, 5, cx, cy, radius * 1.4);
        grad.addColorStop(0, 'rgba(0, 242, 254, 0.8)');
        grad.addColorStop(0.5, 'rgba(127, 0, 255, 0.4)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius * 1.3, 0, Math.PI * 2);
        this.ctx.fillStyle = grad;
        this.ctx.fill();

        // Core Ring
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        this.ctx.strokeStyle = 'rgba(0, 242, 254, 0.6)';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

    drawListeningWaves(cx, cy) {
        // Dynamic Green Waveforms
        this.ctx.save();
        this.ctx.translate(cx, cy);

        for (let j = 0; j < 3; j++) {
            this.ctx.beginPath();
            const color = j === 0 ? '#10b981' : j === 1 ? '#00f2fe' : '#3b82f6';
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2.5;

            for (let i = -140; i <= 140; i += 4) {
                const distFromCenter = 1 - Math.abs(i) / 140;
                const freq = 0.05 * (j + 1);
                const amp = 35 * distFromCenter * Math.sin(this.phase * 3 + i * freq);
                const y = amp;

                if (i === -140) this.ctx.moveTo(i, y);
                else this.ctx.lineTo(i, y);
            }
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    drawThinkingOrb(cx, cy) {
        // Orbiting glowing dots
        const radius = 50;
        this.ctx.save();
        this.ctx.translate(cx, cy);
        this.ctx.rotate(this.phase * 1.5);

        for (let i = 0; i < 4; i++) {
            const angle = (i * Math.PI / 2);
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;

            this.ctx.beginPath();
            this.ctx.arc(x, y, 8, 0, Math.PI * 2);
            this.ctx.fillStyle = i % 2 === 0 ? '#f59e0b' : '#00f2fe';
            this.ctx.shadowColor = '#f59e0b';
            this.ctx.shadowBlur = 15;
            this.ctx.fill();
        }
        this.ctx.restore();
    }

    drawSpeakingWave(cx, cy) {
        // Vibrant Pink & Magenta Voice Waves
        const radius = 60 + Math.sin(this.phase * 4) * 12;

        const grad = this.ctx.createRadialGradient(cx, cy, 10, cx, cy, radius * 1.5);
        grad.addColorStop(0, 'rgba(236, 72, 153, 0.9)');
        grad.addColorStop(0.6, 'rgba(225, 0, 255, 0.3)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius * 1.4, 0, Math.PI * 2);
        this.ctx.fillStyle = grad;
        this.ctx.fill();

        // Pulsing Rings
        for (let r = 0; r < 3; r++) {
            const rSize = radius + (r * 18 * Math.abs(Math.sin(this.phase * 2)));
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, rSize, 0, Math.PI * 2);
            this.ctx.strokeStyle = `rgba(236, 72, 153, ${0.7 - r * 0.2})`;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }
    }
}

// ==========================================================================
// 5. Main UI Controller & Application Orchestrator
// ==========================================================================
class VoiceAppUI {
    constructor() {
        this.gemini = new GeminiService();
        this.tts = new SpeechSynthesisService();
        this.stt = new VoiceRecognitionService();
        this.visualizer = new CanvasAudioVisualizer('visualizerCanvas');

        this.autoListen = false;
        this.autoSpeak = true;
        this.isProcessing = false;

        this.cacheDOM();
        this.bindEvents();
        this.populateVoiceDropdown();
        this.checkInitialApiKey();
    }

    cacheDOM() {
        // Status & Headers
        this.statusBadge = document.getElementById('statusBadge');
        this.statusText = document.getElementById('statusText');
        this.apiKeyBtn = document.getElementById('apiKeyBtn');
        this.modeIcon = document.getElementById('modeIcon');

        // Voice Switcher & Sliders
        this.femaleVoiceBtn = document.getElementById('femaleVoiceBtn');
        this.maleVoiceBtn = document.getElementById('maleVoiceBtn');
        this.voiceSelect = document.getElementById('voiceSelect');
        this.pitchSlider = document.getElementById('pitchSlider');
        this.pitchVal = document.getElementById('pitchVal');
        this.rateSlider = document.getElementById('rateSlider');
        this.rateVal = document.getElementById('rateVal');

        // Chat Stream & Dock
        this.chatFeed = document.getElementById('chatFeed');
        this.clearChatBtn = document.getElementById('clearChatBtn');
        this.stopAudioBtn = document.getElementById('stopAudioBtn');
        this.interimTranscript = document.getElementById('interimTranscript');
        this.interimText = document.getElementById('interimText');

        // Controls
        this.micBtn = document.getElementById('micBtn');
        this.micHint = document.getElementById('micHint');
        this.textForm = document.getElementById('textForm');
        this.textInput = document.getElementById('textInput');
        this.autoListenToggle = document.getElementById('autoListenToggle');
        this.autoSpeakToggle = document.getElementById('autoSpeakToggle');

        // API Key Modal
        this.apiModal = document.getElementById('apiModal');
        this.apiKeyInput = document.getElementById('apiKeyInput');
        this.modelSelect = document.getElementById('modelSelect');
        this.saveKeyBtn = document.getElementById('saveKeyBtn');
        this.closeModalBtn = document.getElementById('closeModalBtn');
        this.toggleKeyVisibility = document.getElementById('toggleKeyVisibility');
        this.modalNotice = document.getElementById('modalNotice');
    }

    bindEvents() {
        // Voice Switcher (Female / Male)
        this.femaleVoiceBtn.addEventListener('click', () => this.switchVoiceGender('female'));
        this.maleVoiceBtn.addEventListener('click', () => this.switchVoiceGender('male'));

        // Pitch & Rate Sliders
        this.pitchSlider.addEventListener('input', (e) => {
            this.tts.pitch = e.target.value;
            this.pitchVal.textContent = `${e.target.value}x`;
        });

        this.rateSlider.addEventListener('input', (e) => {
            this.tts.rate = e.target.value;
            this.rateVal.textContent = `${e.target.value}x`;
        });

        this.voiceSelect.addEventListener('change', (e) => {
            const voiceName = e.target.value;
            const found = this.tts.voices.find(v => v.name === voiceName);
            if (found) this.tts.selectedVoice = found;
        });

        // Mic Button Trigger
        this.micBtn.addEventListener('click', () => this.toggleListening());

        // Text Form Submit
        this.textForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = this.textInput.value.trim();
            if (text) {
                this.handleUserSubmit(text);
                this.textInput.value = '';
            }
        });

        // Quick Prompt Chips
        document.querySelectorAll('.prompt-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                this.handleUserSubmit(chip.textContent.replace(/"/g, ''));
            });
        });

        // Chat Actions
        this.clearChatBtn.addEventListener('click', () => {
            this.gemini.clearHistory();
            this.chatFeed.innerHTML = `
                <div class="welcome-message">
                    <div class="ai-avatar-lg"><i class="fa-solid fa-robot"></i></div>
                    <h3>Conversation Cleared</h3>
                    <p>Start a new voice query anytime.</p>
                </div>`;
        });

        this.stopAudioBtn.addEventListener('click', () => {
            this.tts.stop();
            this.setAppState('idle', 'System Ready');
        });

        // Toggles
        this.autoListenToggle.addEventListener('change', (e) => {
            this.autoListen = e.target.checked;
        });

        this.autoSpeakToggle.addEventListener('change', (e) => {
            this.autoSpeak = e.target.checked;
        });

        // STT Event Listeners
        this.stt.onInterimCallback = (transcript) => {
            this.interimTranscript.style.display = 'flex';
            this.interimText.textContent = `Listening: "${transcript}"`;
        };

        this.stt.onResultCallback = (finalTranscript) => {
            this.interimTranscript.style.display = 'none';
            this.handleUserSubmit(finalTranscript);
        };

        this.stt.onEndCallback = () => {
            if (this.stt.isListening) return;
            if (this.visualizer.state === 'listening') {
                this.setAppState('idle', 'System Ready');
            }
        };

        this.stt.onErrorCallback = (err) => {
            this.interimTranscript.style.display = 'none';
            this.setAppState('idle', 'Microphone Error');
            if (err === 'not-allowed') {
                alert("Microphone permission denied. Please allow microphone access in your browser address bar.");
            }
        };

        // Modal Events
        this.apiKeyBtn.addEventListener('click', () => this.openApiModal());
        this.closeModalBtn.addEventListener('click', () => this.closeApiModal());
        this.saveKeyBtn.addEventListener('click', () => this.saveApiKey());
        this.toggleKeyVisibility.addEventListener('click', () => {
            const isPassword = this.apiKeyInput.type === 'password';
            this.apiKeyInput.type = isPassword ? 'text' : 'password';
            this.toggleKeyVisibility.innerHTML = isPassword ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
        });
    }

    checkInitialApiKey() {
        if (!this.gemini.hasApiKey()) {
            setTimeout(() => this.openApiModal(), 600);
        }
    }

    openApiModal() {
        this.apiKeyInput.value = this.gemini.apiKey;
        this.modelSelect.value = this.gemini.selectedModel;
        this.modalNotice.style.display = 'none';
        this.apiModal.classList.add('active');
    }

    closeApiModal() {
        this.apiModal.classList.remove('active');
    }

    saveApiKey() {
        const key = this.apiKeyInput.value.trim();
        if (!key) {
            this.showModalNotice("Please enter a valid Gemini API Key.", "error");
            return;
        }
        this.gemini.setApiKey(key);
        this.gemini.setModel(this.modelSelect.value);

        this.showModalNotice("Gemini API Key saved successfully!", "success");
        setTimeout(() => this.closeApiModal(), 800);
    }

    showModalNotice(msg, type) {
        this.modalNotice.textContent = msg;
        this.modalNotice.className = `modal-notice ${type}`;
        this.modalNotice.style.display = 'block';
    }

    populateVoiceDropdown() {
        setTimeout(() => {
            const voices = this.tts.getVoicesForGender(this.tts.currentGender);
            this.voiceSelect.innerHTML = '';

            if (voices.length === 0) {
                this.voiceSelect.innerHTML = `<option value="">Default System Speech Synthesis</option>`;
                return;
            }

            voices.forEach(voice => {
                const opt = document.createElement('option');
                opt.value = voice.name;
                opt.textContent = `${voice.name} (${voice.lang})`;
                if (this.tts.selectedVoice && this.tts.selectedVoice.name === voice.name) {
                    opt.selected = true;
                }
                this.voiceSelect.appendChild(opt);
            });
        }, 500);
    }

    switchVoiceGender(gender) {
        this.femaleVoiceBtn.classList.toggle('active', gender === 'female');
        this.maleVoiceBtn.classList.toggle('active', gender === 'male');

        this.tts.setGender(gender);
        this.pitchSlider.value = this.tts.pitch;
        this.pitchVal.textContent = `${this.tts.pitch}x`;

        this.populateVoiceDropdown();
    }

    toggleListening() {
        if (this.stt.isListening) {
            this.stt.stop();
            this.setAppState('idle', 'System Ready');
        } else {
            if (!this.gemini.hasApiKey()) {
                this.openApiModal();
                return;
            }
            this.tts.stop();
            try {
                this.stt.start();
                this.setAppState('listening', 'Listening to Voice...');
            } catch (err) {
                alert(err.message);
            }
        }
    }

    setAppState(state, labelText) {
        this.visualizer.setState(state);

        // Status Badge Update
        this.statusBadge.className = `status-badge status-${state}`;
        this.statusText.textContent = labelText;

        // Mic Button State
        this.micBtn.classList.toggle('listening', state === 'listening');
        this.micHint.textContent = state === 'listening' ? 'Listening...' : 'Click to Speak';

        // Stop Audio Button visibility
        this.stopAudioBtn.style.display = state === 'speaking' ? 'flex' : 'none';

        // Mode Icon Overlay
        const icons = {
            idle: '<i class="fa-solid fa-microphone-lines"></i>',
            listening: '<i class="fa-solid fa-ear-listen fa-pulse"></i>',
            thinking: '<i class="fa-solid fa-brain fa-bounce"></i>',
            speaking: '<i class="fa-solid fa-volume-high fa-beat"></i>'
        };
        this.modeIcon.innerHTML = icons[state] || icons.idle;
    }

    async handleUserSubmit(userText) {
        if (this.isProcessing) return;
        this.isProcessing = true;

        // Remove Welcome Message if present
        const welcome = this.chatFeed.querySelector('.welcome-message');
        if (welcome) welcome.remove();

        // Render User Bubble
        this.appendChatMessage('user', userText);

        // Update UI State to Thinking
        this.setAppState('thinking', 'Gemini Thinking...');

        try {
            const aiResponse = await this.gemini.generateResponse(userText);
            
            // Render AI Bubble
            const msgObj = this.appendChatMessage('ai', aiResponse);

            // Handle Speech Output
            if (this.autoSpeak) {
                this.setAppState('speaking', `AI Speaking (${this.tts.currentGender.toUpperCase()})...`);
                this.tts.speak(aiResponse, 
                    () => this.setAppState('speaking', 'AI Speaking...'), 
                    () => {
                        this.setAppState('idle', 'System Ready');
                        // Auto-Listen next turn if enabled
                        if (this.autoListen) {
                            setTimeout(() => this.toggleListening(), 500);
                        }
                    }
                );
            } else {
                this.setAppState('idle', 'System Ready');
            }
        } catch (error) {
            this.appendChatMessage('ai', `⚠️ Error: ${error.message}`);
            this.setAppState('idle', 'Error Occurred');
        } finally {
            this.isProcessing = false;
        }
    }

    appendChatMessage(role, text) {
        const row = document.createElement('div');
        row.className = `message-row ${role}`;

        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const avatarHtml = role === 'user' 
            ? `<div class="msg-avatar"><i class="fa-solid fa-user"></i></div>`
            : `<div class="msg-avatar"><i class="fa-solid fa-robot"></i></div>`;

        const playBtnHtml = role === 'ai' 
            ? `<button class="play-msg-btn" title="Replay Speech"><i class="fa-solid fa-volume-high"></i> Play Voice</button>`
            : '';

        row.innerHTML = `
            ${avatarHtml}
            <div class="msg-content">
                <div class="msg-bubble">${this.escapeHTML(text)}</div>
                <div class="msg-footer">
                    <span>${timeStr}</span>
                    ${playBtnHtml}
                </div>
            </div>
        `;

        if (role === 'ai') {
            const playBtn = row.querySelector('.play-msg-btn');
            if (playBtn) {
                playBtn.addEventListener('click', () => {
                    this.setAppState('speaking', 'Replaying Speech...');
                    this.tts.speak(text, null, () => this.setAppState('idle', 'System Ready'));
                });
            }
        }

        this.chatFeed.appendChild(row);
        this.chatFeed.scrollTop = this.chatFeed.scrollHeight;
        return row;
    }

    escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
    }
}

// Initialize Application when DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.voiceApp = new VoiceAppUI();
});
