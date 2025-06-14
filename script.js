document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    const API_BASE_URL = 'https://regiside.onrender.com'; // e.g., https://your-regicide-api.onrender.com
    const CARD_IMAGE_PATH = 'img/cards/';
    let POLLING_INTERVAL = 3000; // Poll for game state every 3 seconds

    // --- State Variables ---
    let currentPlayerId = null;
    let currentPlayerName = null;
    let currentRoomCode = null;
    let currentGameState = null;
    let selectedCardsInHand = [];
    let pollingTimer = null;

    // --- UI Elements ---
    const setupScreen = document.getElementById('setup-screen');
    const gameScreen = document.getElementById('game-screen');
    const playerNameInput = document.getElementById('playerName');
    const roomCodeInput = document.getElementById('roomCodeInput');
    const createRoomBtn = document.getElementById('createRoomBtn');
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    const startGameBtn = document.getElementById('startGameBtn'); // Get the new button
    const setupErrorEl = document.getElementById('setupError');

    const gameRoomCodeEl = document.getElementById('gameRoomCode');
    const gameMessagesEl = document.getElementById('gameMessages');
    const enemyCardEl = document.getElementById('enemyCard');
    const enemyHealthEl = document.getElementById('enemyHealth');
    const enemyAttackEl = document.getElementById('enemyAttack');
    const enemyShieldEl = document.getElementById('enemyShield');
    const playerHandEl = document.getElementById('playerHand');
    const currentPlayerNameEl = document.getElementById('currentPlayerName');
    const playSelectedBtn = document.getElementById('playSelectedBtn');
    const yieldBtn = document.getElementById('yieldBtn');
    const soloJokerBtn = document.getElementById('soloJokerBtn');
    const otherPlayersListEl = document.getElementById('otherPlayersList');
    const tavernDeckSizeEl = document.getElementById('tavernDeckSize');
    const castleDeckSizeEl = document.getElementById('castleDeckSize');
    const hospitalSizeEl = document.getElementById('hospitalSize');
    const gameStateDebugEl = document.getElementById('gameStateDebug');


    // --- Helper Functions ---
    function showSetupError(message) {
        setupErrorEl.textContent = message;
    }

    function showGameMessage(message, isError = false) {
        gameMessagesEl.textContent = message;
        gameMessagesEl.style.color = isError ? 'red' : 'inherit';
        gameMessagesEl.style.backgroundColor = isError ? '#f8d7da' : '#e8f4f8';
    }

    /**
     * Maps API card string (e.g., "SA", "H10", "CJ", "X") to image filename.
     * Assumes images are named like AS.png, 10H.png, JC.png, JOKER.png
     */
    function getCardImageSrc(cardStr) {
        if (!cardStr || typeof cardStr !== 'string') return `${CARD_IMAGE_PATH}card_back.png`; // Default or back

        if (cardStr.toUpperCase() === 'X') {
            return `${CARD_IMAGE_PATH}JOKER.png`;
        }

        let rank = '';
        let suit = '';

        // Standard format: Rank(s) then Suit. e.g. "SA", "10H", "CJ"
        // Our images: Rank + Suit, e.g. AS.png, 10H.png, JC.png
        // API returns S A (Spade Ace)
        // API returns H 10 (Heart 10)
        // API returns C J (Club Jack)

        // Let's assume the API returns Rank then Suit for consistency in string format
        // e.g. "AS", "2H", "10D", "JC", "QK", "KH"
        // If API returns "SA", "H10", we need to adjust parsing or image names.
        // Based on the python engine, it's Rank+Suit, e.g. card.rank + card.suit
        // So "AS" is Ace of Spades, "2H" is 2 of Hearts, "10D" is 10 of Diamonds.

        if (cardStr.length === 2) { // AS, KH, 2D, etc. OR 10 (needs special handling)
            rank = cardStr.substring(0, 1);
            suit = cardStr.substring(1, 2);
        } else if (cardStr.length === 3 && cardStr.startsWith('10')) { // 10S, 10H, etc.
            rank = "10";
            suit = cardStr.substring(2, 3);
        } else {
            console.warn("Unknown card string format:", cardStr);
            return `${CARD_IMAGE_PATH}card_back.png`; // Fallback
        }
        return `${CARD_IMAGE_PATH}${rank.toUpperCase()}${suit.toUpperCase()}.png`;
    }


    async function apiCall(endpoint, method = 'GET', body = null) {
        const url = `${API_BASE_URL}${endpoint}`;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
        };
        if (body) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, options);
            const responseData = await response.json();
            if (!response.ok) {
                console.error('API Error:', responseData);
                const errorMessage = responseData.message || responseData.error || `API Error: ${response.status}`;
                throw new Error(errorMessage);
            }
            return responseData.data || responseData; // Handle both {data: ...} and direct object responses
        } catch (error) {
            console.error(`Error calling ${endpoint}:`, error);
            showGameMessage(`Network or API Error: ${error.message}`, true);
            throw error; // Re-throw for specific handling if needed
        }
    }

    // --- Game Rendering ---
    function renderGameState(gameState) {
        if (!gameState) return;
        currentGameState = gameState; // Store the latest state
        gameStateDebugEl.textContent = JSON.stringify(gameState, null, 2);


        gameRoomCodeEl.textContent = `Room: ${currentRoomCode}`;
        currentPlayerNameEl.textContent = currentPlayerName || "Player";

        // Show Start Game button if user is creator and game is waiting
        if (gameState.status === "WAITING_FOR_PLAYERS" && gameState.created_by_player_id === currentPlayerId) {
            startGameBtn.style.display = 'inline-block';
        } else {
            startGameBtn.style.display = 'none';
        }

        // Enemy
        if (gameState.current_enemy) {
            enemyCardEl.innerHTML = `<img src="${getCardImageSrc(gameState.current_enemy)}" alt="${gameState.current_enemy}">`;
            enemyHealthEl.textContent = gameState.current_enemy_health;
            enemyAttackEl.textContent = gameState.current_enemy_attack;
            enemyShieldEl.textContent = gameState.current_enemy_shield;
        } else {
            enemyCardEl.innerHTML = '<i>No Enemy</i>';
            enemyHealthEl.textContent = '--';
            enemyAttackEl.textContent = '--';
            enemyShieldEl.textContent = '0';
        }

        // Player Hand
        playerHandEl.innerHTML = '';
        const localPlayer = gameState.players.find(p => p.id === currentPlayerId);
        let isMyTurn = gameState.current_player_id === currentPlayerId;

        if (localPlayer && localPlayer.hand) {
            localPlayer.hand.forEach(cardStr => {
                const cardImg = document.createElement('img');
                cardImg.src = getCardImageSrc(cardStr);
                cardImg.alt = cardStr;
                cardImg.dataset.card = cardStr; // Store card value

                if (isMyTurn && gameState.status === "IN_PROGRESS") {
                    cardImg.classList.add('playable');
                    cardImg.onclick = () => toggleSelectCard(cardImg, cardStr);
                    if (selectedCardsInHand.includes(cardStr)) {
                        cardImg.classList.add('selected');
                    }
                } else {
                    cardImg.classList.add('disabled');
                }
                playerHandEl.appendChild(cardImg);
            });
        }
        
        // Disable action buttons if not player's turn or game over
        playSelectedBtn.disabled = !isMyTurn || gameState.status !== "IN_PROGRESS";
        yieldBtn.disabled = !isMyTurn || gameState.status !== "IN_PROGRESS";


        // Other Players
        otherPlayersListEl.innerHTML = '';
        gameState.players.filter(p => p.id !== currentPlayerId).forEach(p => {
            const li = document.createElement('li');
            li.textContent = `${p.name} (Hand: ${p.hand_size})${gameState.current_player_id === p.id ? ' - Current Turn' : ''}`;
            otherPlayersListEl.appendChild(li);
        });

        // Deck Info
        tavernDeckSizeEl.textContent = gameState.tavern_deck_size;
        castleDeckSizeEl.textContent = gameState.castle_deck_size;
        hospitalSizeEl.textContent = gameState.hospital_size;

        // Solo Joker Button
        if (gameState.players.length === 1 && gameState.solo_jokers_available > 0 && isMyTurn) {
            soloJokerBtn.style.display = 'inline-block';
            soloJokerBtn.textContent = `Use Solo Joker (${gameState.solo_jokers_available} left)`;
            soloJokerBtn.disabled = false;
        } else {
            soloJokerBtn.style.display = 'none';
        }

        // Game Over Messages
        if (gameState.status === "WON") {
            showGameMessage("Congratulations! You defeated all Royals and WON the game!");
            stopPolling();
            disableAllGameActions();
        } else if (gameState.status === "LOST") {
            showGameMessage(`Game Over! ${gameState.action_message || 'The Royals have defeated you.'}`, true);
            stopPolling();
            disableAllGameActions();
        } else if (gameState.action_message && gameState.action_message !== "Success") {
             // Display action messages from API if any (e.g., after playing a card)
            showGameMessage(gameState.action_message);
        }
    }
    
    function disableAllGameActions() {
        playSelectedBtn.disabled = true;
        yieldBtn.disabled = true;
        soloJokerBtn.disabled = true;
        playerHandEl.querySelectorAll('img').forEach(img => img.classList.add('disabled'));
    }


    function toggleSelectCard(cardImgEl, cardStr) {
        const index = selectedCardsInHand.indexOf(cardStr);
        if (index > -1) {
            selectedCardsInHand.splice(index, 1); // Remove if already selected
            cardImgEl.classList.remove('selected');
        } else {
            selectedCardsInHand.push(cardStr); // Add if not selected
            cardImgEl.classList.add('selected');
        }
    }

    // --- API Interaction Functions ---
    async function handleCreateRoom() {
        currentPlayerName = playerNameInput.value.trim();
        if (!currentPlayerName) {
            showSetupError("Please enter your name.");
            return;
        }
        // For simplicity, using name as ID. In a real app, use a unique ID.
        currentPlayerId = currentPlayerName + "_" + Date.now(); // Simple unique enough ID for this demo

        try {
            const response = await apiCall('/api/create_room', 'POST', {
                player_id: currentPlayerId,
                player_name: currentPlayerName
            });
            currentRoomCode = response.room_code; // Assuming API returns {room_code: ..., player_id: ...}
            startGameScreen();
            fetchGameState(); // Initial fetch
            startPolling();
        } catch (error) {
            showSetupError(error.message || "Failed to create room.");
        }
    }

    async function handleJoinRoom() {
        currentPlayerName = playerNameInput.value.trim();
        const roomCode = roomCodeInput.value.trim().toUpperCase();
        if (!currentPlayerName) {
            showSetupError("Please enter your name.");
            return;
        }
        if (!roomCode) {
            showSetupError("Please enter a room code to join.");
            return;
        }
        currentPlayerId = currentPlayerName + "_" + Date.now(); // Simple unique enough ID for this demo

        try {
            // join_room API should return the game state
            const gameState = await apiCall('/api/join_room', 'POST', {
                room_code: roomCode,
                player_id: currentPlayerId,
                player_name: currentPlayerName
            });
            currentRoomCode = roomCode;
            startGameScreen();
            renderGameState(gameState); // Render the state received from join
            startPolling();
        } catch (error) {
            showSetupError(error.message || "Failed to join room.");
        }
    }

    async function fetchGameState() {
        if (!currentRoomCode) return;
        try {
            // Pass player_id for perspective (to see own hand)
            const gameState = await apiCall(`/api/game_state/${currentRoomCode}?player_id=${currentPlayerId}`);
            if (gameState) {
                 if (gameState.action_message && currentGameState && gameState.action_message !== currentGameState.action_message){
                    showGameMessage(gameState.action_message); // Show messages from API
                } else if (!gameState.action_message && currentGameState && currentGameState.action_message && currentGameState.action_message !== "Success") {
                    // Clear message if new state has no message but old one did
                    // showGameMessage("Your turn or waiting for opponent...");
                }
                renderGameState(gameState);
            }
        } catch (error) {
            console.error("Failed to fetch game state:", error);
            // Optionally stop polling on certain errors or show a persistent error
        }
    }
    
    function startPolling() {
        stopPolling(); // Clear any existing timer
        if (currentRoomCode) {
            pollingTimer = setInterval(fetchGameState, POLLING_INTERVAL);
            console.log("Polling started for room:", currentRoomCode);
        }
    }

    function stopPolling() {
        if (pollingTimer) {
            clearInterval(pollingTimer);
            pollingTimer = null;
            console.log("Polling stopped.");
        }
    }

    function startGameScreen() {
        setupScreen.style.display = 'none';
        gameScreen.style.display = 'block';
        showGameMessage(`Joined Room: ${currentRoomCode}. Waiting for game to start or for your turn.`);
    }

    async function handlePlaySelectedCards() {
        if (selectedCardsInHand.length === 0) {
            showGameMessage("No cards selected to play.", true);
            return;
        }
        try {
            // The play_cards endpoint in the example returns the full game state
            const updatedGameState = await apiCall('/api/play_cards', 'POST', {
                room_code: currentRoomCode,
                player_id: currentPlayerId,
                cards: selectedCardsInHand
            });
            selectedCardsInHand = []; // Clear selection
            showGameMessage(updatedGameState.action_message || "Cards played successfully."); // Show message from API
            renderGameState(updatedGameState); // Render the direct response
            // Polling will continue to update, or can rely on this direct update.
        } catch (error) {
            showGameMessage(error.message || "Failed to play cards.", true);
            // Don't clear selected cards on error, let user retry or change.
        }
    }

    async function handleYieldTurn() {
        try {
            const updatedGameState = await apiCall('/api/yield_turn', 'POST', {
                room_code: currentRoomCode,
                player_id: currentPlayerId
            });
            selectedCardsInHand = []; // Clear selection (though not used for yield)
            showGameMessage(updatedGameState.action_message || "Turn yielded.");
            renderGameState(updatedGameState);
        } catch (error) {
            showGameMessage(error.message || "Failed to yield turn.", true);
        }
    }
    
    async function handleSoloJoker() {
        try {
            const updatedGameState = await apiCall('/api/use_solo_joker', 'POST', {
                room_code: currentRoomCode,
                player_id: currentPlayerId
            });
            showGameMessage(updatedGameState.action_message || "Solo Joker power used.");
            renderGameState(updatedGameState);
        } catch (error) {
            showGameMessage(error.message || "Failed to use Solo Joker power.", true);
        }
    }

    // Add this new function
    async function handleStartGame() {
        if (!currentRoomCode || !currentPlayerId) {
            showGameMessage("Cannot start game: Room or Player ID missing.", true);
            return;
        }
        try {
            const updatedGameState = await apiCall('/api/start_game', 'POST', {
                room_code: currentRoomCode,
                player_id: currentPlayerId // API requires player_id of creator
            });
            showGameMessage(updatedGameState.message || "Game started successfully!");
            renderGameState(updatedGameState); // Render the state received from start_game
            // Polling will continue to update the state for all players.
        } catch (error) {
            showGameMessage(error.message || "Failed to start game.", true);
        }
    }


    // --- Event Listeners ---
    createRoomBtn.addEventListener('click', handleCreateRoom);
    joinRoomBtn.addEventListener('click', handleJoinRoom);
    startGameBtn.addEventListener('click', handleStartGame); // Add event listener for the new button
    playSelectedBtn.addEventListener('click', handlePlaySelectedCards);
    yieldBtn.addEventListener('click', handleYieldTurn);
    soloJokerBtn.addEventListener('click', handleSoloJoker);
});