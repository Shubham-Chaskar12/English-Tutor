let socket;
let voices = [];
let selectedVoiceName = '';
let speechRate = 0.95;
let isSessionActive = false;

const startBtn = document.getElementById('start-btn');
const transcriptBox = document.getElementById('transcript-box');
const dictBox = document.getElementById('dictionary-box');
const scrollChatBtn = document.getElementById('scroll-chat-btn');
const scrollDictBtn = document.getElementById('scroll-dict-btn');
const visualizer = document.getElementById('visualizer');
const avatarContainer = document.getElementById('avatar-container');
const avatarRing = document.getElementById('avatar-ring');
const avatarMouth = document.getElementById('avatar-mouth');
const statusText = document.getElementById('status-text');

// Settings elements
const settingsModal = document.getElementById('settings-modal');
const openSettingsBtn = document.getElementById('open-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const voiceSelect = document.getElementById('voice-select');
const testVoiceBtn = document.getElementById('test-voice-btn');
const rateSlider = document.getElementById('rate-slider');
const rateValue = document.getElementById('rate-value');
const topicSelect = document.getElementById('topic-select');
const topicBadge = document.getElementById('topic-badge');

// Populate natural English voices
function populateVoices() {
    voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
    // Sort natural/Google/Microsoft Online voices to the top
    voices.sort((a, b) => {
        const score = (name) =>
            name.includes('Natural') || name.includes('Online') ? 3 :
            name.includes('Google') ? 2 :
            name.includes('Aria') || name.includes('Zira') || name.includes('Neerja') ? 1 : 0;
        return score(b.name) - score(a.name);
    });

    voiceSelect.innerHTML = '';
    voices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = `${v.name} (${v.lang})`;
        voiceSelect.appendChild(opt);
    });

    if (voices.length > 0 && !selectedVoiceName) {
        selectedVoiceName = voices[0].name;
        voiceSelect.value = selectedVoiceName;
    }
}

populateVoices();
window.speechSynthesis.onvoiceschanged = populateVoices;

voiceSelect.addEventListener('change', () => {
    selectedVoiceName = voiceSelect.value;
});

rateSlider.addEventListener('input', () => {
    speechRate = parseFloat(rateSlider.value);
    rateValue.innerText = `${speechRate.toFixed(2)}x`;
});

topicSelect.addEventListener('change', () => {
    topicBadge.innerText = `Topic: ${topicSelect.value}`;
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'config', topic: topicSelect.value }));
    }
});

testVoiceBtn.addEventListener('click', () => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance("Hello! I am your English conversation partner. Let's practice together.");
    const v = voices.find(voice => voice.name === selectedVoiceName);
    if (v) u.voice = v;
    u.rate = speechRate;
    window.speechSynthesis.speak(u);
});

// Load SQLite progress stats when opening Settings
async function loadProgressStats() {
    try {
        const res = await fetch('http://localhost:3000/stats');
        const data = await res.json();
        document.getElementById('stat-mistakes').innerText = data.totalMistakes;
        document.getElementById('stat-words').innerText = data.totalWords;
        const list = document.getElementById('recent-mistakes-list');
        if (data.recentMistakes.length === 0) {
            list.innerHTML = `<p class="text-gray-500 italic">No mistakes logged yet. Start talking!</p>`;
        } else {
            list.innerHTML = data.recentMistakes.map(m =>
                `<div class="bg-gray-900/70 p-2 rounded border border-gray-700">
                    <span class="text-red-400 line-through">${m.mistake}</span> → <span class="text-green-400 font-semibold">${m.correction}</span>
                </div>`
            ).join('');
        }
    } catch {
        document.getElementById('recent-mistakes-list').innerHTML = `<p class="text-red-400">Start backend server to view stats.</p>`;
    }
}

openSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
    loadProgressStats();
});

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
});

// Avatar state helper
function setAvatarState(state) {
    if (state === 'speaking') {
        visualizer.classList.add('speaking');
        avatarRing.classList.remove('hidden', 'bg-green-500/20');
        avatarRing.classList.add('bg-blue-500/30');
        avatarContainer.classList.add('border-blue-400', 'scale-105');
        avatarContainer.classList.remove('border-green-400', 'border-gray-700');
        avatarMouth.setAttribute('d', 'M50 65 Q60 76 70 65 Q60 69 50 65'); // Open smile
        statusText.innerText = 'Tutor is speaking...';
    } else if (state === 'listening') {
        visualizer.classList.remove('speaking');
        avatarRing.classList.remove('hidden', 'bg-blue-500/30');
        avatarRing.classList.add('bg-green-500/20');
        avatarContainer.classList.add('border-green-400');
        avatarContainer.classList.remove('border-blue-400', 'scale-105', 'border-gray-700');
        avatarMouth.setAttribute('d', 'M50 66 Q60 73 70 66'); // Friendly smile
        statusText.innerText = 'Listening to you...';
    } else {
        visualizer.classList.remove('speaking');
        avatarRing.classList.add('hidden');
        avatarContainer.classList.remove('border-blue-400', 'border-green-400', 'scale-105');
        avatarContainer.classList.add('border-gray-700');
        avatarMouth.setAttribute('d', 'M50 66 Q60 73 70 66');
        statusText.innerText = 'Ready to chat';
    }
}

// Smart auto-scroll controller
function createSmartScroller(box, jumpBtn) {
    const isNearBottom = () => box.scrollHeight - box.scrollTop - box.clientHeight <= 50;

    box.addEventListener('scroll', () => {
        jumpBtn.classList.toggle('hidden', isNearBottom());
    });

    jumpBtn.addEventListener('click', () => {
        box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
        jumpBtn.classList.add('hidden');
    });

    return {
        isNearBottom,
        scrollToBottom: () => {
            requestAnimationFrame(() => {
                box.scrollTop = box.scrollHeight;
                jumpBtn.classList.add('hidden');
            });
        }
    };
}

const chatScroller = createSmartScroller(transcriptBox, scrollChatBtn);
const dictScroller = createSmartScroller(dictBox, scrollDictBtn);

function appendChat(html) {
    const shouldScroll = chatScroller.isNearBottom();
    transcriptBox.insertAdjacentHTML('beforeend', html);
    if (shouldScroll) chatScroller.scrollToBottom();
}

function appendDict(html) {
    const shouldScroll = dictScroller.isNearBottom();
    dictBox.insertAdjacentHTML('beforeend', html);
    if (shouldScroll) dictScroller.scrollToBottom();
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
    appendChat(`<p class="text-red-500">Error: Your browser does not support Speech Recognition. Use Google Chrome or Edge.</p>`);
} else {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';

    let currentActiveElement = null;

    function stopSession() {
        isSessionActive = false;
        try { recognition.stop(); } catch {}
        window.speechSynthesis.cancel();
        if (socket && socket.readyState === WebSocket.OPEN) socket.close();

        setAvatarState('idle');
        startBtn.innerText = 'Start Session';
        startBtn.classList.remove('bg-red-500', 'hover:bg-red-400', 'text-white');
        startBtn.classList.add('bg-green-500', 'hover:bg-green-400', 'text-gray-900');
        appendChat(`<p class="text-yellow-400">System: AI stopped.</p>`);
    }

    startBtn.addEventListener('click', () => {
        if (isSessionActive) {
            stopSession();
            return;
        }

        isSessionActive = true;
        appendChat(`<p class="text-yellow-400">System: Connecting to backend...</p>`);
        socket = new WebSocket('ws://localhost:3000');

        socket.onopen = () => {
            // Send selected topic immediately
            socket.send(JSON.stringify({ type: 'config', topic: topicSelect.value }));

            startBtn.innerText = 'Stop AI';
            startBtn.classList.remove('bg-green-500', 'hover:bg-green-400', 'text-gray-900');
            startBtn.classList.add('bg-red-500', 'hover:bg-red-400', 'text-white');
            setAvatarState('listening');
            appendChat(`<p class="text-green-400">System: Connected & Listening...</p>`);

            try { recognition.start(); } catch (err) { console.error(err); }
        };

        socket.onerror = () => {
            appendChat(`<p class="text-red-500">Error: Cannot connect to backend. Is node server.js running?</p>`);
            stopSession();
        };

        socket.onmessage = (event) => {
            if (!isSessionActive) return;
            const data = JSON.parse(event.data);

            if (data.type === 'ai-reply') {
                const payload = data.payload;
                appendChat(`<p class="mb-2 text-blue-400"><strong>Tutor:</strong> ${payload.tutor_reply}</p>`);

                if (payload.grammar && payload.grammar.length > 0) {
                    payload.grammar.forEach(g => {
                        appendDict(`
                        <div class="mb-2 p-3 bg-red-900/30 border border-red-700 rounded">
                            <p class="text-red-400 line-through">${g.mistake}</p>
                            <p class="text-green-400 font-bold mt-1">${g.correction}</p>
                            <p class="text-xs text-gray-300 mt-1">💡 ${g.reason}</p>
                        </div>`);
                    });
                }

                if (payload.vocabulary && payload.vocabulary.length > 0) {
                    payload.vocabulary.forEach(v => {
                        appendDict(`
                        <div class="mb-2 p-3 bg-blue-900/30 border border-blue-700 rounded">
                            <p class="font-bold text-blue-300">${v.word}</p>
                            <p class="text-xs text-gray-200 mt-1"><strong>En:</strong> ${v.english_meaning}</p>
                            <p class="text-xs text-gray-200"><strong>Mr:</strong> ${v.marathi_meaning}</p>
                            <p class="text-xs text-gray-400 mt-1 italic">"${v.example}"</p>
                        </div>`);
                    });
                }

                const utterance = new SpeechSynthesisUtterance(payload.tutor_reply);
                const chosenVoice = voices.find(v => v.name === selectedVoiceName);
                if (chosenVoice) utterance.voice = chosenVoice;
                utterance.rate = speechRate;

                utterance.onstart = () => setAvatarState('speaking');
                utterance.onend = () => {
                    if (isSessionActive) {
                        setAvatarState('listening');
                        try { recognition.start(); } catch {}
                    } else {
                        setAvatarState('idle');
                    }
                };

                window.speechSynthesis.speak(utterance);
            }
        };

        recognition.onresult = (event) => {
            if (!isSessionActive) return;
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            const shouldScroll = chatScroller.isNearBottom();
            if (!currentActiveElement) {
                currentActiveElement = document.createElement('p');
                currentActiveElement.className = "mb-2 text-green-400";
                transcriptBox.appendChild(currentActiveElement);
            }

            if (interimTranscript !== '') {
                currentActiveElement.innerHTML = `<strong>You:</strong> ${interimTranscript} <span class="animate-pulse">...</span>`;
            }

            if (finalTranscript !== '') {
                currentActiveElement.innerHTML = `<strong>You:</strong> ${finalTranscript}`;
                currentActiveElement = null;
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ type: 'user-speech', text: finalTranscript }));
                }
            }

            if (shouldScroll) chatScroller.scrollToBottom();
        };

        recognition.onerror = (event) => {
            if (isSessionActive && event.error !== 'no-speech' && event.error !== 'aborted') {
                appendChat(`<p class="text-red-500">Microphone Error: ${event.error}</p>`);
            }
        };
    });
}