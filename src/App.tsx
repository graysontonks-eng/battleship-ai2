import { useState, useCallback, useRef } from 'react';
import './App.css';
import type {
  Board,
  GamePhase,
  Turn,
  Ship,
  Orientation,
  Position,
  GameMessage,
} from './types';
import {
  BOARD_SIZE,
  SHIP_CONFIGS,
  ROW_LABELS,
  COL_LABELS,
} from './types';
import {
  createEmptyBoard,
  placeShip,
  canPlaceShip,
  processShot,
  allShipsSunk,
  getCoordinateLabel,
} from './gameLogic';
import type { AIState } from './ai';
import {
  placeShipsRandomly,
  createAIState,
  getAIShot,
  updateAIAfterShot,
} from './ai';

function App() {
  // Game phase
  const [phase, setPhase] = useState<GamePhase>('placement');
  const [turn, setTurn] = useState<Turn>('player');

  // Player state
  const [playerBoard, setPlayerBoard] = useState<Board>(createEmptyBoard());
  const [playerShips, setPlayerShips] = useState<Ship[]>([]);

  // AI state
  const [aiBoard, setAiBoard] = useState<Board>(createEmptyBoard());
  const [aiShips, setAiShips] = useState<Ship[]>([]);
  const [aiState, setAiState] = useState<AIState>(createAIState());

  // Placement state
  const [currentShipIndex, setCurrentShipIndex] = useState(0);
  const [orientation, setOrientation] = useState<Orientation>('horizontal');
  const [hoverPos, setHoverPos] = useState<Position | null>(null);

  // Shot processing lock to prevent rapid double-click race condition
  const isProcessingShot = useRef(false);

  // Messages
  const [messages, setMessages] = useState<GameMessage[]>([
    { text: 'Place your ships to begin!', type: 'info' },
  ]);

  const addMessage = useCallback((text: string, type: GameMessage['type']) => {
    setMessages((prev) => [{ text, type }, ...prev]);
  }, []);

  // Ship placement
  const currentShipConfig =
    currentShipIndex < SHIP_CONFIGS.length
      ? SHIP_CONFIGS[currentShipIndex]
      : null;

  const handlePlacementClick = useCallback(
    (row: number, col: number) => {
      if (!currentShipConfig) return;

      const result = placeShip(
        playerBoard,
        { row, col },
        currentShipConfig,
        orientation
      );

      if (result) {
        setPlayerBoard(result.board);
        setPlayerShips((prev) => [...prev, result.ship]);
        addMessage(
          `Placed ${currentShipConfig.name} at ${getCoordinateLabel({ row, col })}`,
          'info'
        );

        if (currentShipIndex + 1 >= SHIP_CONFIGS.length) {
          // All ships placed, start game
          const aiResult = placeShipsRandomly();
          setAiBoard(aiResult.board);
          setAiShips(aiResult.ships);
          setPhase('playing');
          setCurrentShipIndex(currentShipIndex + 1);
          addMessage('All ships placed! Battle begins! Your turn to fire.', 'info');
        } else {
          setCurrentShipIndex(currentShipIndex + 1);
        }
      }
    },
    [playerBoard, currentShipConfig, orientation, currentShipIndex, addMessage]
  );

  const handlePlacementHover = useCallback(
    (row: number, col: number) => {
      setHoverPos({ row, col });
    },
    []
  );

  const handlePlacementLeave = useCallback(() => {
    setHoverPos(null);
  }, []);

  const toggleOrientation = useCallback(() => {
    setOrientation((prev) =>
      prev === 'horizontal' ? 'vertical' : 'horizontal'
    );
  }, []);

  // AI turn logic
  const doAITurn = useCallback(
    (currentAiState: AIState, currentPlayerBoard: Board, currentPlayerShips: Ship[]) => {
      const target = getAIShot(currentAiState);
      const result = processShot(currentPlayerBoard, currentPlayerShips, target);

      setPlayerBoard(result.board);
      setPlayerShips(result.ships);

      // If ship was sunk, find its positions so the AI can preserve
      // hit queue entries from other ships it was tracking
      let sunkShipPositions: Position[] | undefined;
      if (result.result === 'sunk' && result.shipName) {
        const sunkShip = result.ships.find((s) => s.name === result.shipName);
        if (sunkShip) {
          sunkShipPositions = sunkShip.positions;
        }
      }

      const newAiState = updateAIAfterShot(currentAiState, target, result.result, sunkShipPositions);
      setAiState(newAiState);

      const coordLabel = getCoordinateLabel(target);

      if (result.result === 'sunk') {
        addMessage(
          `AI fired at ${coordLabel}: Hit and sunk your ${result.shipName}!`,
          'sunk'
        );
      } else if (result.result === 'hit') {
        addMessage(
          `AI fired at ${coordLabel}: Hit on your ${result.shipName}!`,
          'hit'
        );
      } else {
        addMessage(`AI fired at ${coordLabel}: Miss.`, 'miss');
      }

      if (allShipsSunk(result.ships)) {
        setPhase('gameOver');
        addMessage('The AI sunk all your ships! You lose.', 'win');
        return;
      }

      setTurn('player');
      isProcessingShot.current = false;
    },
    [addMessage]
  );

  // Player attack
  const handlePlayerAttack = useCallback(
    (row: number, col: number) => {
      if (isProcessingShot.current) return;
      if (phase !== 'playing' || turn !== 'player') return;
      isProcessingShot.current = true;

      const cell = aiBoard[row][col];
      if (cell === 'hit' || cell === 'miss' || cell === 'sunk') {
        isProcessingShot.current = false;
        return;
      }

      const result = processShot(aiBoard, aiShips, { row, col });
      setAiBoard(result.board);
      setAiShips(result.ships);

      const coordLabel = getCoordinateLabel({ row, col });

      if (result.result === 'sunk') {
        addMessage(
          `You fired at ${coordLabel}: Hit and sunk ${result.shipName}!`,
          'sunk'
        );
      } else if (result.result === 'hit') {
        addMessage(
          `You fired at ${coordLabel}: Hit on ${result.shipName}!`,
          'hit'
        );
      } else {
        addMessage(`You fired at ${coordLabel}: Miss.`, 'miss');
      }

      if (allShipsSunk(result.ships)) {
        setPhase('gameOver');
        addMessage('You sunk all enemy ships! You win!', 'win');
        return;
      }

      setTurn('ai');

      // AI takes its turn after a short delay
      setTimeout(() => {
        doAITurn(aiState, playerBoard, playerShips);
      }, 600);
    },
    [phase, turn, aiBoard, aiShips, aiState, playerBoard, playerShips, addMessage, doAITurn]
  );

  // Reset game
  const resetGame = useCallback(() => {
    setPhase('placement');
    setTurn('player');
    setPlayerBoard(createEmptyBoard());
    setPlayerShips([]);
    setAiBoard(createEmptyBoard());
    setAiShips([]);
    setAiState(createAIState());
    setCurrentShipIndex(0);
    setOrientation('horizontal');
    setHoverPos(null);
    setMessages([{ text: 'Place your ships to begin!', type: 'info' }]);
  }, []);

  // Get preview cells for placement
  const getPreviewCells = useCallback((): {
    positions: Position[];
    valid: boolean;
  } => {
    if (!hoverPos || !currentShipConfig) return { positions: [], valid: false };

    const positions: Position[] = [];
    for (let i = 0; i < currentShipConfig.size; i++) {
      const row =
        orientation === 'vertical' ? hoverPos.row + i : hoverPos.row;
      const col =
        orientation === 'horizontal' ? hoverPos.col + i : hoverPos.col;
      positions.push({ row, col });
    }

    const valid = canPlaceShip(
      playerBoard,
      hoverPos,
      currentShipConfig.size,
      orientation
    );

    return { positions, valid };
  }, [hoverPos, currentShipConfig, orientation, playerBoard]);

  // Get status text
  const getStatusText = (): string => {
    if (phase === 'placement') {
      if (currentShipConfig) {
        return `Place your ${currentShipConfig.name} (${currentShipConfig.size} cells)`;
      }
      return 'Starting battle...';
    }
    if (phase === 'gameOver') {
      return allShipsSunk(aiShips) ? 'Victory! You won!' : 'Defeat! AI wins!';
    }
    return turn === 'player'
      ? 'Your turn - Click on the enemy grid to fire!'
      : 'AI is taking its shot...';
  };

  const getStatusClass = (): string => {
    if (phase === 'gameOver') return 'status-bar game-over';
    if (phase === 'placement') return 'status-bar';
    return turn === 'player' ? 'status-bar your-turn' : 'status-bar ai-turn';
  };

  // Render a grid cell
  const renderCell = (
    board: Board,
    row: number,
    col: number,
    isPlayerBoard: boolean
  ) => {
    const cellState = board[row][col];
    let className = 'cell';

    if (isPlayerBoard && phase === 'placement') {
      // Show ship preview
      const preview = getPreviewCells();
      const isPreview = preview.positions.some(
        (p) => p.row === row && p.col === col
      );

      if (isPreview) {
        className += preview.valid ? ' ship-preview' : ' ship-preview-invalid';
      } else if (cellState === 'ship') {
        className += ' ship';
      } else {
        className += ' water clickable';
      }

      return (
        <div
          key={`${row}-${col}`}
          className={className}
          onClick={() => handlePlacementClick(row, col)}
          onMouseEnter={() => handlePlacementHover(row, col)}
          onMouseLeave={handlePlacementLeave}
        />
      );
    }

    if (isPlayerBoard) {
      // Player's own board during gameplay - show ships and hits
      if (cellState === 'sunk') className += ' sunk';
      else if (cellState === 'hit') className += ' hit';
      else if (cellState === 'miss') className += ' miss';
      else if (cellState === 'ship') className += ' ship';
      else className += ' water';

      return <div key={`${row}-${col}`} className={className} />;
    }

    // AI board - hide ships, show hits/misses
    if (cellState === 'sunk') className += ' sunk';
    else if (cellState === 'hit') className += ' hit';
    else if (cellState === 'miss') className += ' miss';
    else {
      className += ' water';
      if (phase === 'playing' && turn === 'player') {
        className += ' clickable';
      }
    }

    const canClick =
      phase === 'playing' &&
      turn === 'player' &&
      cellState !== 'hit' &&
      cellState !== 'miss' &&
      cellState !== 'sunk';

    return (
      <div
        key={`${row}-${col}`}
        className={className}
        onClick={canClick ? () => handlePlayerAttack(row, col) : undefined}
      />
    );
  };

  // Render a complete board grid
  const renderBoard = (board: Board, isPlayerBoard: boolean, label: string) => (
    <div className="board-section">
      <div className="board-label">{label}</div>
      <div className="grid grid-10">
        {/* Corner */}
        <div className="grid-corner grid-header" />
        {/* Column headers */}
        {COL_LABELS.map((c) => (
          <div key={`col-${c}`} className="grid-header">
            {c}
          </div>
        ))}
        {/* Rows */}
        {Array.from({ length: BOARD_SIZE }, (_, row) => (
          <div key={`row-${row}`} style={{ display: 'contents' }}>
            <div className="grid-header">
              {ROW_LABELS[row]}
            </div>
            {Array.from({ length: BOARD_SIZE }, (_, col) =>
              renderCell(board, row, col, isPlayerBoard)
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // Render ship legend
  const renderShipLegend = (ships: Ship[]) => (
    <div className="ship-legend">
      {SHIP_CONFIGS.map((config) => {
        const ship = ships.find((s) => s.name === config.name);
        const isSunk = ship ? ship.hits.every((h) => h) : false;
        const isPlaced = !!ship;

        return (
          <div key={config.name} className="ship-legend-item">
            <div className="ship-legend-blocks">
              {Array.from({ length: config.size }, (_, i) => (
                <div
                  key={i}
                  className={`ship-legend-block${isSunk ? ' sunk-block' : isPlaced ? ' placed' : ''}`}
                />
              ))}
            </div>
            <span style={{ textDecoration: isSunk ? 'line-through' : 'none' }}>
              {config.name}
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="game-container">
      <h1 className="game-title">Battleship</h1>
      <p className="game-subtitle">Player vs AI</p>

      <div className={getStatusClass()}>{getStatusText()}</div>

      {phase === 'placement' && currentShipConfig && (
        <div className="placement-controls">
          <div className="placement-info">
            Placing: <span className="ship-name">{currentShipConfig.name}</span>{' '}
            <span className="ship-size">({currentShipConfig.size} cells)</span>
            {' - '}
            <span className="ship-size">{orientation}</span>
          </div>
          <div className="placement-buttons">
            <button className="btn" onClick={toggleOrientation}>
              Rotate (R)
            </button>
          </div>
        </div>
      )}

      {phase !== 'placement' && (
        <>
          <div style={{ marginBottom: '0.25rem', color: '#667', fontSize: '0.8rem' }}>
            YOUR FLEET
          </div>
          {renderShipLegend(playerShips)}
          <div style={{ marginBottom: '0.25rem', color: '#667', fontSize: '0.8rem' }}>
            ENEMY FLEET
          </div>
          {renderShipLegend(aiShips)}
        </>
      )}

      <div className="boards-container">
        {renderBoard(playerBoard, true, phase === 'placement' ? 'Place Your Ships' : 'Your Ocean')}
        {phase !== 'placement' &&
          renderBoard(aiBoard, false, 'Enemy Waters (Click to Fire)')}
      </div>

      {phase === 'gameOver' && (
        <div className="game-actions">
          <button className="btn btn-primary" onClick={resetGame}>
            Play Again
          </button>
        </div>
      )}

      <div className="message-log">
        <div className="message-log-title">Battle Log</div>
        <div className="message-list">
          {messages.map((msg, i) => (
            <div key={i} className={`message-item ${msg.type}`}>
              {msg.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
