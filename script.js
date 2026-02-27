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

// 3. Upload Simulation
function setupUploadSim() {
    const dropZone = document.getElementById('dropZone');
    const uploadStatus = document.getElementById('uploadStatus');
    const uploadBtns = document.querySelectorAll('.upload-area .btn');

    const simulateUpload = () => {
        dropZone.style.display = 'none';
        uploadStatus.classList.remove('hidden');

        // Simulating AI analyzing the document
        setTimeout(() => {
            uploadStatus.innerHTML = `
                <i class="fa-solid fa-circle-check" style="color: var(--success); font-size: 2rem;"></i>
                <p class="text-success" style="margin-top: 10px;">Analysis Complete!</p>
                <p style="font-size: 0.85rem; color: var(--text-secondary);">Found 12 new transactions.</p>
                <button class="btn btn-outline" style="margin-top: 15px;" onclick="resetUpload()">Upload Another</button>
            `;
        }, 2500);
    };

    uploadBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            simulateUpload();
        });
    });

    dropZone.addEventListener('click', simulateUpload);

    // Make reset function globally available
    window.resetUpload = function () {
        uploadStatus.classList.add('hidden');
        uploadStatus.innerHTML = `
            <div class="spinner"></div>
            <p class="gradient-text">AI analyzing document...</p>
        `;
        dropZone.style.display = 'block';
    };
}

// 4. Chat Assistant Simulation
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
            innerHTML += `<div class="avatar-small"><i class="fa-solid fa-robot"></i></div>`;
        }

        innerHTML += `<div class="bubble">${text}</div>`;
        msgDiv.innerHTML = innerHTML;

        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    };

    const handleSend = () => {
        const text = chatInput.value.trim();
        if (!text) return;

        // Hide suggestions if present
        const suggContainer = document.querySelector('.chat-suggestions');
        if (suggContainer) suggContainer.style.display = 'none';

        addMessage(text, true);
        chatInput.value = '';

        // Simulate AI typing and response
        setTimeout(() => {
            let reply = "I'm analyzing your data...";

            if (text.toLowerCase().includes("overspending") || text.toLowerCase().includes("spend")) {
                reply = "Based on this month's data, you are spending 15% more on **Food Delivery** and **Shopping** compared to last month. Consider cooking at home to stay within budget.";
            } else if (text.toLowerCase().includes("phone") || text.toLowerCase().includes("afford")) {
                reply = "You currently have $1,200 in your flexible savings. A new phone might cost around $1,000. While you can afford it, it will deplete your emergency buffer. I recommend saving $250/mo for 4 months instead.";
            } else {
                reply = "That's an interesting question. Looking at your Financial Health score of 85, you are doing great overall. Is there a specific category you want me to analyze?";
            }

            addMessage(reply, false);
        }, 1200);
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
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: var(--gradient-primary);
            color: white;
            padding: 10px 20px;
            border-radius: 20px;
            font-size: 0.9rem;
            z-index: 1000;
            opacity: 0;
            transition: all 0.3s ease;
            box-shadow: var(--glass-shadow);
        }
        .toast.show {
            transform: translateX(-50%) translateY(0);
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
    toast.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${message}`;
    document.body.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
