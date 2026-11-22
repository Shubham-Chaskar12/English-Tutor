let socket;
let voices = [];

// Preload available voices for the AI tutor
window.speechSynthesis.onvoiceschanged = () => {
    voices = window.speechSynthesis.getVoices();
};

const startBtn = document.getElementById('start-btn');
const transcriptBox = document.getElementById('transcript-box');
const dictBox = document.getElementById('dictionary-box');
const visualizer = document.getElementById('visualizer');
const micIndicator = document.getElementById('mic-indicator');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
    transcriptBox.innerHTML += `<p class="text-red-500">Error: Your browser does not support Speech Recognition. Use Google Chrome.</p>`;
} else {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true; // Enables live typing as you speak
    recognition.lang = 'en-IN';

    let currentActiveElement = null;

    startBtn.addEventListener('click', () => {
        transcriptBox.innerHTML += `<p class="text-yellow-400">System: Connecting to backend...</p>`;
        socket = new WebSocket('ws://localhost:3000');
        
        socket.onopen = () => {
            startBtn.innerText = 'Listening...';
            startBtn.classList.replace('bg-green-500', 'bg-blue-500');
            transcriptBox.innerHTML += `<p class="text-green-400">System: Connected. Please allow microphone access.</p>`;
            
            try {
                recognition.start();
            } catch (err) {
                console.error("Mic start error:", err);
            }
        };

        socket.onerror = (error) => {
            console.error("WebSocket Error:", error);
            transcriptBox.innerHTML += `<p class="text-red-500">Error: Cannot connect to backend. Is node server.js running?</p>`;
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === 'ai-reply') {
                const payload = data.payload;
                
                // 1. Render AI Text Response
                transcriptBox.innerHTML += `<p class="mb-2 text-blue-400"><strong>Tutor:</strong> ${payload.tutor_reply}</p>`;
                transcriptBox.scrollTop = transcriptBox.scrollHeight;
                
                // 2. Render Grammar Corrections
                if (payload.grammar && payload.grammar.length > 0) {
                    payload.grammar.forEach(g => {
                        dictBox.innerHTML += `
                        <div class="mb-3 p-3 bg-red-900/30 border border-red-700 rounded">
                            <p class="text-red-400 line-through text-lg">${g.mistake}</p>
                            <p class="text-green-400 font-bold mt-1">${g.correction}</p>
                            <p class="text-xs text-gray-400 mt-2">${g.reason}</p>
                        </div>`;
                    });
                }

                // 3. Render Marathi-English Vocabulary
                if (payload.vocabulary && payload.vocabulary.length > 0) {
                    payload.vocabulary.forEach(v => {
                        dictBox.innerHTML += `
                        <div class="mb-3 p-3 bg-blue-900/30 border border-blue-700 rounded">
                            <p class="font-bold text-blue-300 text-lg">${v.word}</p>
                            <p class="text-sm text-gray-200 mt-1"><span class="font-bold">En:</span> ${v.english_meaning}</p>
                            <p class="text-sm text-gray-200"><span class="font-bold">Mr:</span> ${v.marathi_meaning}</p>
                            <p class="text-xs text-gray-400 mt-2 italic">"${v.example}"</p>
                        </div>`;
                    });
                }
                dictBox.scrollTop = dictBox.scrollHeight;

                // 4. Handle Voice Generation and UI Animations
                const utterance = new SpeechSynthesisUtterance(payload.tutor_reply);
                utterance.lang = 'en-IN';
                
                // Assign a premium natural voice if available
                const bestVoice = voices.find(v => v.name.includes('Google UK English Female') || v.name.includes('Zira') || v.name.includes('Aria') || v.name.includes('Natural'));
                if (bestVoice) utterance.voice = bestVoice;
                utterance.rate = 0.95; // Slightly slower for better comprehension

                utterance.onstart = () => {
                    visualizer.classList.add('speaking');
                    micIndicator.classList.add('scale-110');
                };
                
                utterance.onend = () => {
                    visualizer.classList.remove('speaking');
                    micIndicator.classList.remove('scale-110');
                    recognition.start(); // Automatically resume listening after the tutor finishes speaking
                };
                
                window.speechSynthesis.speak(utterance);
            }
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            // Separate interim (live) text from the final committed sentence
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            // Create a new paragraph element for the user's current speech if one does not exist
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
                currentActiveElement = null; // Reset for the next speech block
                
                // Send only the final complete text to Groq via Node.js
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(finalTranscript);
                }
            }
            
            transcriptBox.scrollTop = transcriptBox.scrollHeight;
        };

        recognition.onerror = (event) => {
            if (event.error !== 'no-speech') {
                transcriptBox.innerHTML += `<p class="text-red-500">Microphone Error: ${event.error}</p>`;
            }
        };
    });
}