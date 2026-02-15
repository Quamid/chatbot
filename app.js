// App State
const state = {
    token: localStorage.getItem('gh_token') || '',
    knowledge: [],
    isListening: false,
    isSpeaking: false
};

// DOM Elements
const chatContainer = document.getElementById('chat-container');
const voiceBtn = document.getElementById('voice-trigger');
const statusText = document.getElementById('status-text');
const modal = document.getElementById('modal');
const apiInput = document.getElementById('api-token');
const saveBtn = document.getElementById('save-token');
const openSettings = document.getElementById('open-settings');

// Initialize
async function init() {
    try {
        const response = await fetch('knowledge.json');
        state.knowledge = await response.json();
        console.log('Knowledge base loaded:', state.knowledge.length, 'items');
    } catch (err) {
        console.error('Failed to load knowledge base:', err);
    }

    if (!state.token) {
        modal.classList.add('active');
    }
}

// UI Helpers
function addMessage(text, isUser = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
    msgDiv.textContent = text;
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Voice Recognition (STT)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = 'hu-HU';
     recognition.interimResults = false;

    recognition.onstart = () => {
        state.isListening = true;
        voiceBtn.classList.add('listening');
        statusText.textContent = 'Figyelek...';
    };

    recognition.onend = () => {
        state.isListening = false;
        voiceBtn.classList.remove('listening');
        statusText.textContent = 'Feldolgozás...';
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        addMessage(transcript, true);
        processQuery(transcript);
    };

    voiceBtn.addEventListener('click', () => {
        if (state.isListening) {
            recognition.stop();
        } else {
            // Stop TTS if speaking
            window.speechSynthesis.cancel();
            recognition.start();
        }
    });
} else {
    statusText.textContent = 'A böngésző nem támogatja a beszédfelismerést.';
}

// Voice Synthesis (TTS)
function speak(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'hu-HU';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    
    utterance.onstart = () => { state.isSpeaking = true; };
    utterance.onend = () => { state.isSpeaking = false; };

    window.speechSynthesis.speak(utterance);
}

// RAG: Search Knowledge Base
function findContext(query) {
    // Simple keyword based retrieval
    const words = query.toLowerCase().split(' ');
    let context = state.knowledge
        .filter(item => {
            const topicMatch = item.topic.toLowerCase().split(' ').some(w => words.includes(w));
            const contentMatch = item.content.toLowerCase().split(' ').some(w => words.includes(w));
            return topicMatch || contentMatch;
        })
        .map(item => item.content)
        .join('\n');
    
    return context || "Nincs specifikus információm erről a tudásbázisban.";
}

// API Call to GitHub Models
async function processQuery(query) {
    if (!state.token) {
        modal.classList.add('active');
        statusText.textContent = 'Hiányzó API kulcs';
        return;
    }

    const context = findContext(query);
    const systemPrompt = `Te egy segítőkész asszisztens vagy. 
KIZÁRÓLAG a következő tudásbázis alapján válaszolj:
### TUDÁSBÁZIS:
${context}
### SZABÁLYOK:
1. Ha a válasz nincs benne a tudásbázisban, udvariasan mondd meg, hogy erről nincs információd.
2. Ne találj ki adatokat (hallucináció tilos).
3. Válaszolj tömören, beszédstílusban (mivel fel lesz olvasva).
4. Mindig magyarul válaszolj.`;

    try {
        const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: query }
                ],
                model: 'gpt-4o-mini',
                temperature: 0.2, // Low temperature to further reduce hallucinations
                max_tokens: 200
            })
        });

        const data = await response.json();
        if (data.choices && data.choices[0]) {
            const reply = data.choices[0].message.content;
            addMessage(reply);
            speak(reply);
            statusText.textContent = 'Készen áll a kérdésre...';
        } else {
            throw new Error('Hibás API válasz');
        }
    } catch (err) {
        console.error('API Error:', err);
        addMessage('Sajnos hiba történt a válaszadás során.');
        statusText.textContent = 'Hiba történt.';
    }
}

// Modal Handlers
saveBtn.addEventListener('click', () => {
    const token = apiInput.value.trim();
    if (token) {
        state.token = token;
        localStorage.setItem('gh_token', token);
        modal.classList.remove('active');
    }
});

openSettings.addEventListener('click', () => {
    apiInput.value = state.token;
    modal.classList.add('active');
});

// Start
init();
