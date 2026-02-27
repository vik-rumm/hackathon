document.addEventListener('DOMContentLoaded', () => {

    // Set up Chart.js global defaults
    Chart.defaults.color = '#94A3B8';
    Chart.defaults.font.family = "'Inter', sans-serif";

    initExpenseChart();
    initComparisonChart();
    setupUploadSim();
    setupChatSim();
    setupInteractions();

});

// 1. Expense Pie Chart
function initExpenseChart() {
    const ctx = document.getElementById('expenseChart').getContext('2d');

    const data = {
        labels: ['Food', 'Coffee', 'Travel', 'Shopping', 'EMI', 'Subscriptions', 'Investments'],
        datasets: [{
            data: [25, 5, 15, 20, 15, 5, 15],
            backgroundColor: [
                '#3B82F6', // Blue
                '#8B5CF6', // Purple
                '#14B8A6', // Teal
                '#F59E0B', // Warning/Orange
                '#EF4444', // Danger/Red
                '#EC4899', // Pink
                '#10B981'  // Success/Green
            ],
            borderWidth: 0,
            hoverOffset: 4
        }]
    };

    const config = {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    display: false // We will create a custom HTML legend if needed, or just let the tooltip work
                },
                tooltip: {
                    backgroundColor: 'rgba(18, 23, 33, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: true,
                    callbacks: {
                        label: function (context) {
                            return ` ${context.label}: ${context.raw}%`;
                        }
                    }
                }
            }
        }
    };

    const myChart = new Chart(ctx, config);

    // Generate Custom Legend
    const legendContainer = document.getElementById('expenseLegend');
    let legendHTML = '';
    data.labels.forEach((label, index) => {
        const color = data.datasets[0].backgroundColor[index];
        const value = data.datasets[0].data[index];
        legendHTML += `
            <div class="legend-item">
                <div class="legend-color" style="background-color: ${color}"></div>
                <span>${label} (${value}%)</span>
            </div>
        `;
    });
    legendContainer.innerHTML = legendHTML;
}

// 2. Investment vs Expense Bar Chart
function initComparisonChart() {
    const ctx = document.getElementById('comparisonChart').getContext('2d');

    const data = {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        datasets: [
            {
                label: 'Expenses',
                data: [3200, 3100, 3400, 2900, 3120, 3120],
                backgroundColor: 'rgba(239, 68, 68, 0.7)',
                borderRadius: 4,
                barPercentage: 0.6
            },
            {
                label: 'Investments',
                data: [1200, 1200, 1200, 1500, 1500, 1500],
                backgroundColor: 'rgba(59, 130, 246, 0.7)',
                borderRadius: 4,
                barPercentage: 0.6
            }
        ]
    };

    const config = {
        type: 'bar',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: {
                        display: false,
                        drawBorder: false
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        callback: function (value) {
                            return '$' + value;
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        boxWidth: 8
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(18, 23, 33, 0.9)',
                    callbacks: {
                        label: function (context) {
                            return ` ${context.dataset.label}: $${context.raw}`;
                        }
                    }
                }
            }
        }
    };

    new Chart(ctx, config);
}

// 3. Document Analysis with Gemini API
function setupUploadSim() {
    const dropZone = document.getElementById('dropZone');
    const uploadStatus = document.getElementById('uploadStatus');
    const fileInput = document.getElementById('fileUpload');
    const btnUploadPdf = document.getElementById('btnUploadPdf');
    const btnUploadImg = document.getElementById('btnUploadImg');

    // Trigger file input
    dropZone.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') fileInput.click();
    });
    btnUploadPdf.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.accept = 'application/pdf';
        fileInput.click();
    });
    btnUploadImg.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.accept = 'image/*';
        fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        dropZone.style.display = 'none';
        uploadStatus.classList.remove('hidden');
        uploadStatus.innerHTML = `
            <div class="spinner"></div>
            <p class="gradient-text">AI analyzing document...</p>
        `;

        const getBase64 = (file) => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve({ base64: reader.result.split(',')[1], mime: file.type });
            reader.onerror = error => reject(error);
        });

        try {
            let apiKey = localStorage.getItem('gemini_api_key') || 'AIzaSyAoMBlNqe8XJt2cVR10tUrRCHQP_44logc';
            const { base64, mime } = await getBase64(file);

            const payload = {
                contents: [{
                    parts: [
                        { text: "Analyze this financial document. Extract the total amount spent, identify the main category (e.g., Food, Shopping, Utilities), and key vendors. Be extremely concise." },
                        {
                            inlineData: {
                                mimeType: mime,
                                data: base64
                            }
                        }
                    ]
                }]
            };

            // First, dynamically find an appropriate model
            const modelsResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            if (!modelsResponse.ok) throw new Error("Could not fetch models list. Invalid API Key?");
            const modelsData = await modelsResponse.json();

            // Look for a flash or pro model that supports generateContent
            let targetModel = "models/gemini-1.5-flash"; // default fallback
            const validModels = modelsData.models.filter(m =>
                m.supportedGenerationMethods.includes("generateContent") &&
                m.name.includes("gemini")
            );

            const flashModel = validModels.find(m => m.name.includes("1.5-flash"));
            const proModel = validModels.find(m => m.name.includes("1.5-pro"));

            if (flashModel) targetModel = flashModel.name;
            else if (proModel) targetModel = proModel.name;
            else if (validModels.length > 0) targetModel = validModels[0].name;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${targetModel}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`API Error: ${response.status} - ${errText}`);
            }

            const data = await response.json();
            const reply = data.candidates[0].content.parts[0].text;

            uploadStatus.innerHTML = `
                <i class="fa-solid fa-circle-check" style="color: var(--success); font-size: 2rem;"></i>
                <p class="text-success" style="margin-top: 10px;">Analysis Complete!</p>
                <div style="font-size: 0.85rem; color: var(--text-secondary); margin: 10px 0; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px; text-align: left;">
                    ${reply.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}
                </div>
                <button class="btn btn-outline" style="margin-top: 5px;" onclick="resetUpload()">Upload Another</button>
            `;
        } catch (error) {
            console.error("Upload API Error Details:", error);
            uploadStatus.innerHTML = `
                <i class="fa-solid fa-circle-xmark" style="color: var(--danger); font-size: 2rem;"></i>
                <p style="color: var(--danger); margin-top: 10px; font-weight: bold;">Error analyzing document</p>
                <div style="font-size: 0.75rem; color: var(--danger); padding: 10px; background: rgba(255,0,0,0.1); border-radius: 8px; text-align: left; max-height: 100px; overflow-y: auto;">
                    ${error.message.replace(/\n/g, '<br>')}
                </div>
                <button class="btn btn-outline" style="margin-top: 15px;" onclick="resetUpload()">Try Again</button>
            `;
        }
    });

    // Make reset function globally available
    window.resetUpload = function () {
        fileInput.value = '';
        uploadStatus.classList.add('hidden');
        dropZone.style.display = 'block';
    };
}

// 4. Chat Assistant with Gemini API
// 4. Chat Assistant with Gemini API
function setupChatSim() {
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.querySelector('.btn-send');
    const messagesContainer = document.getElementById('chatMessages');
    const suggestions = document.querySelectorAll('.suggestion-btn');

    const addMessage = (text, isUser = false) => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${isUser ? 'user-message' : 'ai-message'}`;

        let innerHTML = '';
        if (!isUser) {
            innerHTML += '<div class="avatar-small"><i class="fa-solid fa-robot"></i></div>';
        }

        innerHTML += '<div class="bubble"></div>';
        msgDiv.innerHTML = innerHTML;

        // Parse basic markdown if needed (bolding)
        const bubble = msgDiv.querySelector('.bubble');
        bubble.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        return bubble; // Return bubble to update it if needed (streaming/loading)
    };

    const callGeminiAPI = async (promptText, loadingBubble) => {
        let apiKey = localStorage.getItem('gemini_api_key') || 'AIzaSyAoMBlNqe8XJt2cVR10tUrRCHQP_44logc';
        if (!apiKey) {
            apiKey = prompt("Please enter your Gemini API Key to use the AI assistant:");
            if (apiKey) {
                localStorage.setItem('gemini_api_key', apiKey);
            } else {
                loadingBubble.innerText = "API key is required to use the AI assistant. Please refresh and try again.";
                return;
            }
        }

        try {
            // Provide some context to the AI about the app
            const systemContext = "You are 'AI Money Coach', a helpful and professional personal finance AI assistant inside a modern dark-themed dashboard.\nThe user (Alex) has a financial health score of 85.\nTotal Income: $6,240\nTotal Expenses: $3,120\nInvestments: $1,500\nMonthly Budget: $2,500 / $3,000 (83% used).\nKeep your answers concise, friendly, and formatted nicely.";

            // First, dynamically find an appropriate model
            const modelsResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            if (!modelsResponse.ok) throw new Error("Could not fetch models list. Invalid API Key?");
            const modelsData = await modelsResponse.json();

            let targetModel = "models/gemini-1.5-flash";
            const validModels = modelsData.models.filter(m =>
                m.supportedGenerationMethods.includes("generateContent") &&
                m.name.includes("gemini")
            );

            const flashModel = validModels.find(m => m.name.includes("1.5-flash"));
            const proModel = validModels.find(m => m.name.includes("1.5-pro"));

            if (flashModel) targetModel = flashModel.name;
            else if (proModel) targetModel = proModel.name;
            else if (validModels.length > 0) targetModel = validModels[0].name;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${targetModel}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: systemContext + "\nUser: " + promptText }]
                    }]
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`API Error: ${response.status} - ${errText}`);
            }

            const data = await response.json();
            const reply = data.candidates[0].content.parts[0].text;

            // Format and update bubble
            loadingBubble.innerHTML = reply.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
            messagesContainer.scrollTop = messagesContainer.scrollHeight;

        } catch (error) {
            console.error("Gemini API Error:", error);
            if (error.message.includes("400")) {
                loadingBubble.innerText = "Invalid API Key. Please click Settings or clear your browser data to reset it.";
                localStorage.removeItem('gemini_api_key');
            } else {
                loadingBubble.innerText = "Sorry, I encountered an error while analyzing your data. Please try again later.";
            }
        }
    };

    const handleSend = () => {
        const text = chatInput.value.trim();
        if (!text) return;

        // Hide suggestions if present
        const suggContainer = document.querySelector('.chat-suggestions');
        if (suggContainer) suggContainer.style.display = 'none';

        addMessage(text, true);
        chatInput.value = '';

        // Add loading message
        const loadingBubble = addMessage("Thinking...", false);

        // Call Real API
        callGeminiAPI(text, loadingBubble);
    };

    sendBtn.addEventListener('click', handleSend);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSend();
    });

    // Handle suggestion clicks
    suggestions.forEach(btn => {
        btn.addEventListener('click', function () {
            chatInput.value = this.innerText;
            handleSend();
        });
    });
}

// 5. General UI Interactions
function setupInteractions() {
    // Sidebar Navigation Active State
    const navItems = document.querySelectorAll('.sidebar-nav li');
    navItems.forEach(item => {
        item.addEventListener('click', function (e) {
            e.preventDefault();
            navItems.forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');

            // Simple toast notification for demo purposes
            showToast(`Loading ${this.innerText.trim()}...`);
        });
    });

    // Sidebar Footer (Settings)
    const settingsBtn = document.querySelector('.sidebar-footer a');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', function (e) {
            e.preventDefault();
            showToast('Opening Settings...');
        });
    }

    // Top Header Interactions
    const bellBtn = document.querySelector('.notification-bell');
    if (bellBtn) {
        bellBtn.addEventListener('click', function () {
            // Hide badge on click
            const badge = this.querySelector('.badge');
            if (badge) badge.style.display = 'none';
            showToast('You have no new notifications');
        });
    }

    const avatarBtn = document.querySelector('.avatar');
    if (avatarBtn) {
        avatarBtn.addEventListener('click', function () {
            showToast('Opening User Profile');
        });
    }

    // Chart Select Dropdown
    const chartSelect = document.querySelector('.custom-select');
    if (chartSelect) {
        chartSelect.addEventListener('change', function () {
            showToast(`Updating chart data to ${this.value}...`);
        });
    }

    // Add Toast Styles Dynamically (if not in CSS)
    const style = document.createElement('style');
    style.innerHTML = `
                    .toast {
                        position: fixed;
                        bottom: 20px;
                        left: 50 %;
                        transform: translateX(-50 %) translateY(100px);
            background: var(--gradient - primary);
                color: white;
                padding: 10px 20px;
                border - radius: 20px;
                font - size: 0.9rem;
                z - index: 1000;
                opacity: 0;
                transition: all 0.3s ease;
                box - shadow: var(--glass - shadow);
            }
        .toast.show {
        transform: translateX(-50 %) translateY(0);
        opacity: 1;
    }
    `;
    document.head.appendChild(style);
}

// Helper to show temporary toast messages
function showToast(message) {
    // Remove existing toast if any
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `< i class="fa-solid fa-circle-info" ></i > ${message} `;
    document.body.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
