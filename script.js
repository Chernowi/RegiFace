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
    const enemyImmunityStatusEl = document.getElementById('enemyImmunityStatus'); // New
    const playerHandEl = document.getElementById('playerHand');
    const currentPlayerNameEl = document.getElementById('currentPlayerName');
    const playSelectedBtn = document.getElementById('playSelectedBtn');
    const yieldBtn = document.getElementById('yieldBtn');
    const submitDefenseBtn = document.getElementById('submitDefenseBtn'); // New
    const soloJokerBtn = document.getElementById('soloJokerBtn');
    const otherPlayersListEl = document.getElementById('otherPlayersList');
    const tavernDeckSizeEl = document.getElementById('tavernDeckSize');
    const castleDeckSizeEl = document.getElementById('castleDeckSize');
    const hospitalSizeEl = document.getElementById('hospitalSize');
    const hospitalCardsDisplayEl = document.getElementById('hospitalCardsDisplay'); // New UI Element
    const gameStateDebugEl = document.getElementById('gameStateDebug');
    const jesterChoiceAreaEl = document.getElementById('jesterChoiceArea'); // New
    const jesterPlayerChoicesListEl = document.getElementById('jesterPlayerChoicesList'); // New
    const confirmJesterChoiceBtn = document.getElementById('confirmJesterChoiceBtn'); // New

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
     * Assumes images are named like AS.png, 10D.png, JC.png, JOKER.png
     */
    function getCardImageSrc(cardStr) {
        if (!cardStr || typeof cardStr !== 'string') return `${CARD_IMAGE_PATH}card_back.png`; // Default or back

        if (cardStr.toUpperCase() === 'X') {
            return `${CARD_IMAGE_PATH}JOKER.png`;
        }
        // Card string for images is RankSuit.png e.g. AC.png, 10D.png, KH.png
        // API uses RankSuit e.g. AC, 10D, KH
        // Ensure cardStr matches the format expected by image names (e.g. "AS", "10D")
        // The existing logic seems to correctly form RankSuit from various inputs.
        // For "AS", rank="A", suit="S" -> AS.png
        // For "10D", rank="10", suit="D" -> 10D.png
        // This function is primarily for image lookup, not detailed game logic.

        let rank = '';
        let suit = '';

        if (cardStr.length === 2) { 
            rank = cardStr.substring(0, 1);
            suit = cardStr.substring(1, 2);
        } else if (cardStr.length === 3 && cardStr.startsWith('10')) { 
            rank = "10";
            suit = cardStr.substring(2, 3);
        } else {
            console.warn("Unknown card string format for image:", cardStr);
            return `${CARD_IMAGE_PATH}card_back.png`; // Fallback
        }
        return `${CARD_IMAGE_PATH}${rank.toUpperCase()}${suit.toUpperCase()}.png`;
    }

    function getCardInfo(cardStr) {
        if (!cardStr || typeof cardStr !== 'string') return null;

        const info = {
            id: cardStr, // Store the original string
            rank: '',
            suit: '',
            value: 0, // Numeric value for combo checks (2-9 for cards 2-9, 1 for Ace)
            attackValue: 0, // Actual attack value as per rules
            isJester: false,
            isAce: false,
            isRoyal: false // J, Q, K
        };

        if (cardStr.toUpperCase() === 'X') {
            info.isJester = true;
            info.rank = 'X';
            info.value = 0;
            info.attackValue = 0;
            return info;
        }

        let rankPart = '';
        let suitPart = '';

        if (cardStr.startsWith('10')) {
            rankPart = "10";
            suitPart = cardStr.substring(2, 3);
        } else if (cardStr.length === 2) {
            rankPart = cardStr.substring(0, 1);
            suitPart = cardStr.substring(1, 2);
        } else {
            console.warn("Unknown card string for getCardInfo:", cardStr);
            return null;
        }

        info.rank = rankPart.toUpperCase();
        info.suit = suitPart.toUpperCase();

        if (info.rank === 'A') {
            info.isAce = true;
            info.value = 1; // For sum checks, though Aces are excluded from same-rank combos
            info.attackValue = 1;
        } else if (info.rank === 'K') {
            info.isRoyal = true;
            info.value = 10; // Royals are not part of sum-to-10 combos
            info.attackValue = 20;
        } else if (info.rank === 'Q') {
            info.isRoyal = true;
            info.value = 10;
            info.attackValue = 15;
        } else if (info.rank === 'J') {
            info.isRoyal = true;
            info.value = 10;
            info.attackValue = 10;
        } else { // Numbered cards 2-9 and 10
            const numericValue = parseInt(info.rank, 10);
            if (!isNaN(numericValue)) {
                info.value = numericValue; // This is used for sum-to-10 combo checks
                info.attackValue = numericValue;
            }
        }
        return info;
    }

    function checkPlayValidity(cardsArray) {
        if (!cardsArray) return false;

        const infos = cardsArray.map(getCardInfo);
        if (infos.some(info => info === null)) {
            console.error("Invalid card string found in selection:", cardsArray);
            return false; // Contains unparseable card strings
        }

        const numCards = infos.length;

        if (numCards === 0) {
            return true; // No cards selected is a valid state (though not a valid play to submit)
        }

        if (numCards === 1) {
            return true; // Any single card can be selected (and is a valid play)
        }

        // Check for Jester: Jesters can only be played alone.
        if (infos.some(c => c.isJester)) {
            return numCards === 1 && infos[0].isJester;
        }

        // Check for Ace + one other non-Jester card
        if (numCards === 2) {
            const hasAce = infos.some(c => c.isAce);
            const hasJester = infos.some(c => c.isJester);
            if (hasAce && !hasJester) {
                // If one is Ace, the other must not be an Ace (Ace + Ace is not a special combo)
                // Ace + Other (non-Ace, non-Jester) is valid.
                const aceCount = infos.filter(c => c.isAce).length;
                return aceCount === 1;
            }
        }

        // Check for same-rank combo (2-9 cards, sum of values <= 10, no Aces, no Royals)
        const firstCardInfo = infos[0];
        if (!firstCardInfo.isAce && !firstCardInfo.isRoyal && !firstCardInfo.isJester) {
            const allSameRank = infos.every(c =>
                c.rank === firstCardInfo.rank &&
                !c.isAce && !c.isRoyal && !c.isJester
            );
            if (allSameRank) {
                const sumOfValues = infos.reduce((sum, c) => sum + c.value, 0);
                return sumOfValues <= 10;
            }
        }
        
        // If it's not a single card, not an Ace pair, and not a valid same-rank combo, it's invalid for >1 card.
        return false;
    }

    // Add this new helper function
    function getSelectedCardsDefenseValue() {
        if (!currentGameState || !selectedCardsInHand || selectedCardsInHand.length === 0) {
            return 0;
        }
        return selectedCardsInHand.reduce((sum, cardStr) => {
            const cardInfo = getCardInfo(cardStr);
            // Use attackValue from getCardInfo, as it aligns with discard values (J=10, Q=15, K=20, A=1, Num=Val, X=0)
            return sum + (cardInfo ? cardInfo.attackValue : 0); 
        }, 0);
    }

    // Add this new function to manage the defense button state
    function updateDefenseButtonState() {
        if (currentGameState && currentGameState.status === "AWAITING_DEFENSE") {
            // Ensure the button is visible before trying to enable/disable it
            // The visibility is controlled by renderGameState
            if (submitDefenseBtn.style.display !== 'none') {
                const defenseValue = getSelectedCardsDefenseValue();
                const requiredDefense = currentGameState.damage_to_defend || 0;
                submitDefenseBtn.disabled = defenseValue < requiredDefense;
            }
        } else {
            // If not in defense mode, ensure button is disabled (though likely hidden by renderGameState)
            // submitDefenseBtn.disabled = true; 
        }
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

        // Reset UI elements to default states
        playSelectedBtn.style.display = 'none';
        yieldBtn.style.display = 'none';
        submitDefenseBtn.style.display = 'none';
        jesterChoiceAreaEl.style.display = 'none';
        startGameBtn.style.display = 'none';
        enemyImmunityStatusEl.style.display = 'none';
        playerHandEl.innerHTML = ''; // Clear hand before re-rendering

        if (gameState.active_joker_cancels_immunity) {
            enemyImmunityStatusEl.style.display = 'block';
        }

        // Show Start Game button if user is creator and game is waiting
        if (gameState.status === "WAITING_FOR_PLAYERS" && gameState.created_by_player_id === currentPlayerId) {
            startGameBtn.style.display = 'inline-block';
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

        // Player Hand & Actions based on game state
        const localPlayer = gameState.players.find(p => p.id === currentPlayerId);
        let canPlayerAct = false;

        if (gameState.status === "IN_PROGRESS") {
            if (gameState.current_player_id === currentPlayerId) {
                canPlayerAct = true;
                playSelectedBtn.style.display = 'inline-block';
                yieldBtn.style.display = 'inline-block';
                showGameMessage(`Your turn, ${currentPlayerName}.`);
            } else {
                const P = gameState.players.find(p => p.id === gameState.current_player_id);
                showGameMessage(`Waiting for ${P ? P.name : 'opponent'}...`);
            }
        } else if (gameState.status === "AWAITING_DEFENSE") {
            if (gameState.player_to_defend_id === currentPlayerId) {
                canPlayerAct = true; // Can select cards for defense
                submitDefenseBtn.style.display = 'inline-block';
                showGameMessage(`You must defend against ${gameState.damage_to_defend} damage! Select cards to discard.`);
            } else {
                const P = gameState.players.find(p => p.id === gameState.player_to_defend_id);
                showGameMessage(`Waiting for ${P ? P.name : 'player'} to defend...`);
            }
        } else if (gameState.status === "AWAITING_JESTER_CHOICE") {
            if (gameState.jester_chooser_id === currentPlayerId) {
                jesterChoiceAreaEl.style.display = 'block';
                populateJesterChoices(gameState.players, currentPlayerId);
                showGameMessage("You played a Jester! Choose the next player.");
            } else {
                const P = gameState.players.find(p => p.id === gameState.jester_chooser_id);
                showGameMessage(`Waiting for ${P ? P.name : 'player'} to choose the next player...`);
            }
        }


        if (localPlayer && localPlayer.hand) {
            localPlayer.hand.forEach(cardStr => {
                const cardImg = document.createElement('img');
                cardImg.src = getCardImageSrc(cardStr);
                cardImg.alt = cardStr;
                cardImg.dataset.card = cardStr; // Store card value

                if (canPlayerAct || (gameState.status === "AWAITING_DEFENSE" && gameState.player_to_defend_id === currentPlayerId)) {
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

        // Render Hospital Cards
        if (hospitalCardsDisplayEl && gameState.hospital_cards) {
            hospitalCardsDisplayEl.innerHTML = ''; // Clear previous cards
            if (gameState.hospital_cards.length > 0) {
                gameState.hospital_cards.forEach(cardStr => {
                    const cardImg = document.createElement('img');
                    cardImg.src = getCardImageSrc(cardStr);
                    cardImg.alt = cardStr;
                    // Add a class for specific styling if needed, e.g., smaller size
                    // cardImg.classList.add('discard-pile-card'); 
                    hospitalCardsDisplayEl.appendChild(cardImg);
                });
            } else {
                hospitalCardsDisplayEl.innerHTML = '<i>Empty</i>';
            }
        }


        // Solo Joker Button
        if (gameState.players.length === 1 && gameState.solo_jokers_available > 0 && gameState.current_player_id === currentPlayerId && gameState.status === "IN_PROGRESS") {
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
        } else if (gameState.action_message && gameState.action_message !== "Success" && gameState.status !== "IN_PROGRESS" && gameState.status !== "AWAITING_DEFENSE" && gameState.status !== "AWAITING_JESTER_CHOICE") {
            // Display general action messages if not handled by specific state messages
            showGameMessage(gameState.action_message);
        }
        // Call after hand rendering and other UI updates for the current state:
        updateDefenseButtonState(); 
    }
    
    function disableAllGameActions() {
        playSelectedBtn.disabled = true;
        yieldBtn.disabled = true;
        submitDefenseBtn.disabled = true; // New
        confirmJesterChoiceBtn.disabled = true; // New
        soloJokerBtn.disabled = true;
        playerHandEl.querySelectorAll('img').forEach(img => {
            img.classList.add('disabled');
            img.onclick = null; // Remove click handlers
        });
        jesterChoiceAreaEl.style.display = 'none';
    }

    function populateJesterChoices(players, chooserId) {
        jesterPlayerChoicesListEl.innerHTML = '';
        players.forEach(player => {
            const label = document.createElement('label');
            label.style.display = 'block';
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'jesterNextPlayer';
            radio.value = player.id;
            if (player.id === chooserId) radio.checked = true; // Default to self or first

            label.appendChild(radio);
            label.appendChild(document.createTextNode(` ${player.name}`));
            jesterPlayerChoicesListEl.appendChild(label);
        });
    }

    function updateHandSelectionUI() {
        const handImages = playerHandEl.querySelectorAll('img');
        handImages.forEach(img => {
            if (selectedCardsInHand.includes(img.dataset.card)) {
                img.classList.add('selected');
            } else {
                img.classList.remove('selected');
            }
        });
    }

    function toggleSelectCard(cardImgEl, cardStr) {
        const isCurrentlySelected = selectedCardsInHand.includes(cardStr);

        if (currentGameState && currentGameState.status === "AWAITING_DEFENSE") {
            // For defense, allow any card to be selected or deselected.
            // The submitDefenseBtn will be enabled/disabled based on total value.
            if (isCurrentlySelected) {
                selectedCardsInHand = selectedCardsInHand.filter(c => c !== cardStr);
            } else {
                selectedCardsInHand.push(cardStr);
            }
        } else {
            // Original logic for "IN_PROGRESS" (playing cards) using checkPlayValidity
            let newSelectionAttempt = [];
            if (isCurrentlySelected) {
                // Attempt to deselect the card
                newSelectionAttempt = selectedCardsInHand.filter(c => c !== cardStr);
            } else {
                // Attempt to add the card to the current selection
                const potentialSelectionWithAddition = [...selectedCardsInHand, cardStr];
                if (checkPlayValidity(potentialSelectionWithAddition)) {
                    newSelectionAttempt = potentialSelectionWithAddition;
                } else {
                    // If adding the card makes the current selection invalid,
                    // try selecting this card alone. This allows switching play types.
                    if (checkPlayValidity([cardStr])) { // A single card is always a valid selection start
                        newSelectionAttempt = [cardStr];
                    } else {
                        // This case should ideally not be reached if checkPlayValidity([cardStr]) is robust
                        showGameMessage("This card cannot be selected in this manner.", true);
                        updateHandSelectionUI(); // Re-render to show current valid selection
                        updateDefenseButtonState(); // Also update defense button if relevant
                        return;
                    }
                }
            }
            selectedCardsInHand = newSelectionAttempt;
        }

        updateHandSelectionUI();
        updateDefenseButtonState(); // Call this after any selection change
    }

    // --- API Interaction Functions ---
    async function handleCreateRoom() {
        currentPlayerName = playerNameInput.value.trim();
        if (!currentPlayerName) {
            showSetupError("Please enter your name.");
            return;
        }
        // For simplicity, using name as ID. In a real app, use a unique ID.
        let initialPlayerId = currentPlayerName + "_" + Date.now(); // Simple unique enough ID for this demo

        const customRoomCode = roomCodeInput.value.trim().toUpperCase();
        const requestBody = {
            player_id: initialPlayerId,
            player_name: currentPlayerName
        };

        if (customRoomCode) {
            requestBody.custom_room_code = customRoomCode;
        }

        try {
            const createRoomResponse = await apiCall('/api/create_room', 'POST', requestBody);
            // Assuming API returns {data: {room_code: ..., player_id: ...}} 
            // and apiCall returns the inner 'data' object.
            // Or if apiCall returns the full response, it might be response.data.room_code
            currentRoomCode = createRoomResponse.room_code; 
            currentPlayerId = createRoomResponse.player_id; // Use the player_id from the API response

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
                 // More specific message handling is now in renderGameState based on status
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
        // Initial message will be set by renderGameState
    }

    async function handlePlaySelectedCards() {
        if (selectedCardsInHand.length === 0) {
            showGameMessage("No cards selected to play.", true);
            return;
        }
        // Validate the final selection before sending to the API
        if (!checkPlayValidity(selectedCardsInHand)) {
            showGameMessage("Invalid card combination. Please check your selection.", true);
            // Example: if selection is [Ace, Ace] or [Ace, Jester]
            // Or a combo that sums to > 10, or mixed ranks not involving an Ace.
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
            // Fetch current state to ensure UI consistency after error
            fetchGameState();
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
            fetchGameState();
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
            fetchGameState();
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
            fetchGameState();
        }
    }

    // New handler for submitting defense cards
    async function handleSubmitDefense() {
        // The button should be disabled by updateDefenseButtonState if selection is insufficient.
        // This message can serve as a fallback or if the player somehow tries to submit with 0 cards
        // when damage > 0 (though the button should be disabled).
        if (selectedCardsInHand.length === 0 && currentGameState && currentGameState.damage_to_defend > 0) {
            showGameMessage("You must select cards to discard for defense.", true);
            // return; // It might be better to let the API decide if an empty hand for defense is a game-losing move.
        }
        try {
            const updatedGameState = await apiCall('/api/defend', 'POST', {
                room_code: currentRoomCode,
                player_id: currentPlayerId, // The API expects the ID of the player defending
                cards: selectedCardsInHand
            });
            selectedCardsInHand = [];
            showGameMessage(updatedGameState.action_message || "Defense submitted.");
            renderGameState(updatedGameState);
        } catch (error) {
            showGameMessage(error.message || "Failed to submit defense.", true);
            // Potentially game over, fetch state to confirm
            fetchGameState();
        }
    }

    // New handler for confirming Jester's choice of next player
    async function handleConfirmJesterChoice() {
        const selectedRadio = jesterPlayerChoicesListEl.querySelector('input[name="jesterNextPlayer"]:checked');
        if (!selectedRadio) {
            showGameMessage("Please select a player to go next.", true);
            return;
        }
        const chosenPlayerId = selectedRadio.value;

        try {
            const updatedGameState = await apiCall('/api/choose_next_player', 'POST', {
                room_code: currentRoomCode,
                player_id: currentPlayerId, // The API expects the ID of the player who played the Jester
                chosen_player_id: chosenPlayerId
            });
            showGameMessage(updatedGameState.action_message || "Next player chosen.");
            renderGameState(updatedGameState);
        } catch (error) {
            showGameMessage(error.message || "Failed to choose next player.", true);
            fetchGameState();
        }
    }


    // --- Event Listeners ---
    createRoomBtn.addEventListener('click', handleCreateRoom);
    joinRoomBtn.addEventListener('click', handleJoinRoom);
    startGameBtn.addEventListener('click', handleStartGame); // Add event listener for the new button
    playSelectedBtn.addEventListener('click', handlePlaySelectedCards);
    yieldBtn.addEventListener('click', handleYieldTurn);
    soloJokerBtn.addEventListener('click', handleSoloJoker);
    submitDefenseBtn.addEventListener('click', handleSubmitDefense); // New
    confirmJesterChoiceBtn.addEventListener('click', handleConfirmJesterChoice); // New
});