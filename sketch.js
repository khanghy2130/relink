const GRID_DATA = [
  {x: 4, y: [-4,0]},
  {x: 3, y: [-4,1]},
  {x: 2, y: [-4,2]},
  {x: 1, y: [-4,3]},
  {x: 0, y: [-4,4]},
  {x: -1, y: [-3,4]},
  {x: -2, y: [-2,4]},
  {x: -3, y: [-1,4]},
  {x: -4, y: [0,4]}
];
const BASE_TILES = [];
GRID_DATA.forEach(obj => {
  for (let i=obj.y[0]; i <= obj.y[1]; i++){
    BASE_TILES.push([obj.x, i]);
  }
});

const CANVAS_SIZE = 500;
const BG_COLOR = 20;
const MOVING_DURATION = 7; // amount of frames
const EXPLODING_DURATION = 12; // amount of frames
const offset = [CANVAS_SIZE/2, CANVAS_SIZE/2];

const TILE_SCALE = 30;
const SQRT_3 = Math.sqrt(3);
const HALF_SQRT_3 = SQRT_3 / 2;
const HALF_TILE_SCALE = TILE_SCALE / 2;
const SCALED_SQRT = HALF_SQRT_3 * TILE_SCALE;

const HOVER_RANGE = TILE_SCALE * 0.8;
const DIRS = {
  "UP": {vel: [0,-1], deg:0, opposite:"DOWN"},
  "UP-LEFT": {vel: [-1,0], deg:-60, opposite:"DOWN-RIGHT"},
  "DOWN-LEFT": {vel: [-1,1], deg:-120, opposite:"UP-RIGHT"},
  "DOWN": {vel: [0,1], deg:-180, opposite:"UP"},
  "DOWN-RIGHT": {vel: [1,0], deg:-240, opposite:"UP-LEFT"},
  "UP-RIGHT": {vel: [1,-1], deg:-300, opposite:"DOWN-LEFT"}
};
const SOUNDS_LIST = { // each object has vol and file
  "click": {vol: 0.7},
  "lose": {vol: 0.6},
  "win": {vol: 1.3},
  "slide": {vol: 3.3},
  "explosion": {vol: 0.07},
  "music": {vol: 0.2}
};


// GAME CONTROLS
let levelsData = []; // list of {lvObj, isSolved}
let currentLevelIndex = 0;
let undoList = []; // list of stringified lvObj's
// list of {isLocked: boolean, pos: [x,y], isHidden: boolean}
let gameStatus = "playing"; // "won" / "lost"
let circlesList = [];
let powerCellsList = [];

let selectedCircle = null; // null or the circle object
let hoveredCircle = null; // unlocked circles only, for mouseClicked
let selectedDir = null; // starts moving when selected
let hoveredDir = null; // for mouseClicked

let explosionsList = []; // list of {pos,animationProgress}
const MESSAGE_DURATION = [30, 80]; // (begin/end), middle
const MESSAGE_MOVE_RANGE = 50;
let pickedMessage = "";
let messageAnimationProgress = 0;
let messageStatus = "begin"; //begin,middle,end

let soundIsOn = true;
let gridIsOn = false;
let menuIsOpen = true;
const levelBtns = [];
let isAtTitleScene = true;
const TITLE_SCENE_POWER_CELLS = [[-4,1],[-3,2],[-2,2],[-3,1],[-2,3],[-1,3],[-1,2],[0,1],[1,1],[2,0],[3,-1],[3,-2],[4,-3],[2,-1],[2,1],[1,2],[0,4],[0,3],[0,2],[-2,1]];

// mc = moving control
const mc = {
  isMoving: false,
  isBouncing: false,
  bouncedAmount: 0,
  outOfGridMoves: 0, // amount of moves outside grid
  animationProgress: 0, // 1 to MOVING_DURATION
  dirObj: null,
  movingCircles: [],
  hitLockedCircles: []
};


/*
  Called when starts moving and after done moving once
  1. If just moved (!isFirstCall) then apply new position and check if all in grid
  2. Find hitCircles
  3. If none found, move once then recall
  4. If there are any locked circle(s), bounce back once
  5. If there are no locked circle but any unlocked circle(s), stop
*/
function recursiveMove(justMoved = true){
  const vel = mc.dirObj.vel;
  // STEP 1: apply new position, check numbered ending, check out of grid
  if (justMoved){
    mc.movingCircles.forEach(c => {
      c.pos = [c.pos[0] + vel[0], c.pos[1] + vel[1]]
    });
    
    // check if any numbered circle reaches 0
    const endingNumberedCircles = [];
    mc.movingCircles.forEach(mcObj => {
      if (mcObj.numberValue !== null){
        mcObj.numberValue--;
        if (mcObj.numberValue <= 0) endingNumberedCircles.push(mcObj);
      }
    });
    // should stop moving?
    if (endingNumberedCircles.length > 0){
      endingNumberedCircles.forEach(numberedCircle => {
        numberedCircle.numberValue = null;
        explosionsList.push({ // add explosion
          pos: numberedCircle.pos, 
          animationProgress: 0
        });
      });
      const explosionSound = SOUNDS_LIST["explosion"].file;
      if (!explosionSound.isPlaying()) explosionSound.play();
      return stopMoving();
    }
    
    // check if NOT all moving circles are inside the grid
    if (!mc.movingCircles.every(c => isInsideGrid(c.pos))){
      mc.outOfGridMoves++;
      if (mc.outOfGridMoves > 8){
        setGameStatus("lost");
        return stopMoving();
      }
    }
  }
  
  const hitCircles = [];
  // STEP 2: find and add to hitCircles
  mc.movingCircles.forEach(mcObj => {
    const nextPos = [mcObj.pos[0] + vel[0], mcObj.pos[1] + vel[1]];
    circlesList.forEach(c => {
      if (!c.isHidden && 
      c.pos[0] === nextPos[0] && 
      c.pos[1] === nextPos[1]){
        hitCircles.push(c);
      }
    })
  });
  
  // if already bounced enough then stop
  if (mc.bouncedAmount >= mc.bouncesLimit) return stopMoving();
  
  // STEP 3: NO CIRCLES? move once, increase bounces if bouncing, reduce numberValues if any
  if (hitCircles.length === 0){
    if (mc.isBouncing) mc.bouncedAmount++;
    mc.animationProgress = 1; // starts moving animation
  }
  // STEP 4: THERE ARE LOCKED CIRCLE(S)? move backward
  else if (hitCircles.some(c => c.isLocked)){
    const hitLockedCircles = hitCircles.filter(c => c.isLocked);
    hitLockedCircles.forEach(lockedCircle => {
      lockedCircle.isLocked = false;
      explosionsList.push({ // add explosion
        pos: lockedCircle.pos, 
        animationProgress: 0
      });
    });
    const explosionSound = SOUNDS_LIST["explosion"].file;
    if (!explosionSound.isPlaying()) explosionSound.play();
    // set up bouncing
    mc.isBouncing = true;
    mc.bouncedAmount = 0;
    mc.bouncesLimit = hitLockedCircles.length;
    mc.outOfGridMoves = 0; // reset
    mc.dirObj = DIRS[mc.dirObj.opposite];
    recursiveMove(false); // just set up the bouncing, not moved
  }
  // STEP 5: NO LOCKED CIRCLE? stop
  else stopMoving();
}

function stopMoving(){
  SOUNDS_LIST["slide"].file.stop();
  mc.isMoving = false;
  mc.isBouncing = false;
  mc.bouncedAmount = 0;
  mc.dirObj = null;
  mc.hitLockedCircles = [];
  selectedCircle = null;
  selectedDir = null;
  mc.movingCircles.forEach(c => {c.isHidden = false;})
  
  // check lose
  if (!circlesList.every(c => isInsideGrid(c.pos))){
    setGameStatus("lost");
  }
  // check win
  else if (gameStatus === "playing" && circlesList.length > 0){
    const linkedList = getNeighbors(
      circlesList[0].pos, [circlesList[0]]
    );
    const allLinked = linkedList.length === circlesList.length;
    const allPowerCellsCovered = powerCellsList.every(pos => (
      circlesList.some(c => !c.isLocked && c.pos[0] === pos[0] && c.pos[1] === pos[1])
    ));
    const noNumberedCircles = circlesList
      .every(circleObj => circleObj.numberValue === null);
    
    if (allLinked && allPowerCellsCovered && noNumberedCircles) {
      setGameStatus("won");
      levelsData[currentLevelIndex].isSolved = true;
			const levelsSolved = levelsData.map(({isSolved}) => isSolved);
			localStorage.setItem("levelsSolved", JSON.stringify(levelsSolved));
    }
  }
  
  // save to undoList
  const lvObj = {
    circles: circlesList
      .filter(c=>!c.isLocked&&c.numberValue===null)
      .map(c=>c.pos),
    lockedCircles: circlesList
      .filter(c=>c.isLocked)
      .map(c=>c.pos),
    numberedCircles: circlesList
      .filter(c=>c.numberValue !== null)
      .map(c=>([c.pos,c.numberValue])),
    powerCells: powerCellsList
  };
  undoList.push(JSON.stringify(lvObj));
}

function initiateSlide(){
  // setup
  SOUNDS_LIST["slide"].file.loop();
  mc.isMoving = true;
  mc.isBouncing = false;
  mc.outOfGridMoves = 0;
  mc.animationProgress = 0;
  mc.dirObj = DIRS[selectedDir];
  
  // find linked circles then hide them
  mc.movingCircles = getNeighbors(selectedCircle.pos, [selectedCircle]);
  mc.movingCircles.forEach(c => {c.isHidden = true;})
  
  recursiveMove(false);
}

// takes 1.spreading position 
// 2.array which will be returned with added neighbors
function getNeighbors(pos, arr){
  // get all neighbor positions
  const neighbors = [];
  for (const dir in DIRS){
    const vel = DIRS[dir].vel;
    neighbors.push([pos[0] + vel[0], pos[1] + vel[1]]);
  }
  
  // for each neighbor: check if they exist, and not already in arr
  neighbors.forEach(nPos => {
    let nCircle = null;
    const doesExist = circlesList.some(c => {
      if (c.pos[0] === nPos[0] && c.pos[1] === nPos[1] &&
      !c.isLocked){
        nCircle = c;
        return true;
      }
      return false;
    });
    if (!doesExist) return;
    const alreadyAdded = arr.some(c => (
      c.pos[0] === nPos[0] && c.pos[1] === nPos[1]
    ));
    if (alreadyAdded) return;
    
    // does exist and not already added?
    arr.push(nCircle);
    getNeighbors(nPos, arr);
  });
  
  return arr;
}

function isInsideGrid(pos){
  // X in range?
  if (pos[0] < -4 || pos[0] > 4) return false;
  return GRID_DATA.some(obj => {
    const sameX = pos[0] === obj.x;
    const withinY = pos[1] >= obj.y[0] && pos[1] <= obj.y[1];
    return sameX && withinY;
  })
}


// takes in grid pos, returns center render pos
function calculateRenderPos(pos){
  return [
    offset[0] + pos[0] * TILE_SCALE * 3 / 2,
    offset[1] + (pos[1] * 2 + pos[0]) * SCALED_SQRT
  ];
}

function renderImage(img, [x, y], imageScale = 1){
  const imageSize = imageScale * TILE_SCALE * 2;
  image(img, x, y, imageSize, imageSize);
}

function renderTile([x,y]){
  beginShape();
  vertex(x + TILE_SCALE, y);
  vertex(x + HALF_TILE_SCALE, y + SCALED_SQRT);
  vertex(x - HALF_TILE_SCALE, y + SCALED_SQRT);
  vertex(x - TILE_SCALE, y);
  vertex(x - HALF_TILE_SCALE, y - SCALED_SQRT);
  vertex(x + HALF_TILE_SCALE, y - SCALED_SQRT);
  endShape(CLOSE);
}

function tileIsHovered([x, y]){
  return dist(mouseX, mouseY, x, y) < HOVER_RANGE;
}

function renderArrows([x,y]){
  Object.keys(DIRS).forEach(dir => {
    const {vel, deg} = DIRS[dir];
    const appliedPos = [
      selectedCircle.pos[0] + vel[0],
      selectedCircle.pos[1] + vel[1]
    ];
    
    let arrowScale = 1;
    const arrowRenderPos = calculateRenderPos(appliedPos);
    if (tileIsHovered(arrowRenderPos)) { // check hover
      hoveredDir = dir;
      arrowScale = 1.1;
      // renders all tiles in that direction
      const highlightTiles = [];
      let stepsTaken = 1;
      while (true){
        const newPos = [
          selectedCircle.pos[0] + vel[0] * stepsTaken,
          selectedCircle.pos[1] + vel[1] * stepsTaken
        ];
        if (isInsideGrid(newPos)) {
          highlightTiles.push(newPos);
          stepsTaken++;
        } else break;
      }
      strokeWeight(2);
      stroke(250, 180, 30); // highlight color
      noFill();
      highlightTiles.forEach(pos => {
        renderTile(calculateRenderPos(pos));
      })
    }
    
    push();
    translate(x,y); rotate(deg); scale(arrowScale);
    renderImage(arrowImg, [0,-50], 0.7);
    pop();
  });
}
const connectionPos = [-TILE_SCALE*0.88,0];
const connectionScale = 0.5;
function renderConnections(circleObj, [x,y], forHidden = false, targetCirclesList = circlesList){
  // loop through all circles to make connections
  targetCirclesList.forEach(otherCircleObj => {
    const canConnect = forHidden || !otherCircleObj.isHidden;
    if (!otherCircleObj.isLocked && canConnect){
      // check 3 neighbors
      const thisPos = circleObj.pos;
      const otherPos = otherCircleObj.pos;

      // (-1, 0)
      if (thisPos[0] - 1 === otherPos[0] && 
          thisPos[1] === otherPos[1]){
        push();
        translate(x,y);
        rotate(30);
        renderImage(connectionImg,connectionPos, connectionScale);
        pop();
      }
      // (-1, +1)
      else if (thisPos[0] - 1 === otherPos[0] && 
               thisPos[1] + 1 === otherPos[1]){
        push();
        translate(x,y);
        rotate(-30);
        renderImage(connectionImg,connectionPos, connectionScale);
        pop();
      }
      // (0, -1)
      else if (thisPos[0] === otherPos[0] && 
               thisPos[1] - 1 === otherPos[1]){
        push();
        translate(x,y);
        rotate(90);
        renderImage(connectionImg,connectionPos, connectionScale);
        pop();
      }
    }
  })
}

const allBtns = {
  reset: {
    isHovered: false,
    btnText: "Reset(R)", 
    btnTextSize: 18, 
    renderPos: [430, 65], 
    btnWidth: 110, 
    btnHeight: 30,
    shouldBlink: function(){
      return gameStatus === "lost";
    },
    func: function(){
      loadLevel(levelsData[currentLevelIndex].lvObj, true);
    }
  },
  undo: {
    isHovered: false,
    btnText: "Undo(Z)", 
    btnTextSize: 22, 
    renderPos: [420, 465], 
    btnWidth: 110, 
    btnHeight: 40,
    shouldBlink: function(){
      return gameStatus === "lost";
    },
    func: function(){
			// if is moving
			if (mc.isMoving){
				// exit if nothing to load
				if (undoList.length < 1) return;
				const lastSaved = undoList.pop();
        loadLevel(JSON.parse(lastSaved), false);
			}
      // not moving? if has more than 1 saved
      else if (undoList.length > 1){
        undoList.pop(); // first removal
        const lastSaved = undoList.pop();
        loadLevel(JSON.parse(lastSaved), false);
      }
    }
  },
  previous: {
    isHovered: false,
    btnText: "<", 
    btnTextSize: 25, 
    renderPos: [40, 470], 
    btnWidth: 50, 
    btnHeight: 35,
    shouldRender: function(){
      return currentLevelIndex > 0;
    },
    shouldBlink: null,
    func: function(){
      currentLevelIndex--;
      loadLevel(levelsData[currentLevelIndex].lvObj, true);
    }
  },
  next: {
    isHovered: false,
    btnText: ">", 
    btnTextSize: 25, 
    renderPos: [100, 470], 
    btnWidth: 50, 
    btnHeight: 35,
    shouldRender: function(){
      return currentLevelIndex < levelsData.length - 1;
    },
    shouldBlink: function(){
      return gameStatus === "won";
    },
    func: function(){
      currentLevelIndex++;
      loadLevel(levelsData[currentLevelIndex].lvObj, true);
    }
  },
  mute: {
    isHovered: false,
    btnText: "Sound: On", 
    btnTextSize: 15, 
    renderPos: [50, 30], 
    btnWidth: 100, 
    btnHeight: 25,
    shouldRender: null,
    shouldBlink: null,
    func: function(){
      soundIsOn = !soundIsOn;
      if (!soundIsOn){ // muting
        allBtns.mute.btnText = "Sound: Off";
        for (const name in SOUNDS_LIST){
          SOUNDS_LIST[name].file.setVolume(0);
        }
      } else {
        allBtns.mute.btnText = "Sound: On";
        for (const name in SOUNDS_LIST){
          const soundObj = SOUNDS_LIST[name];
          soundObj.file.setVolume(soundObj.vol);
        }
      }
    }
  },
	gridBtn: {
    isHovered: false,
    btnText: "Grid: Off", 
    btnTextSize: 15, 
    renderPos: [50, 70], 
    btnWidth: 100, 
    btnHeight: 25,
    shouldRender: null,
    shouldBlink: null,
    func: function(){
      gridIsOn = !gridIsOn;
      if (!gridIsOn){ // off
        allBtns.gridBtn.btnText = "Grid: Off";
      } else {
        allBtns.gridBtn.btnText = "Grid: On";
      }
    }
  },
  menu: {
    isHovered: false,
    btnText: "Menu", 
    btnTextSize: 18, 
    renderPos: [430, 25], 
    btnWidth: 100, 
    btnHeight: 30,
    shouldRender: null,
    shouldBlink: null,
    func: function(){
      menuIsOpen = true;
    }
  }
};

function renderBtn(btnObj){
  const {btnText, btnTextSize, renderPos, btnWidth, btnHeight, func, shouldBlink, shouldRender} = btnObj;
  
  if (shouldRender && !shouldRender()) return; 
  
  const [x,y] = renderPos;
  let btnColor = "white";
  if (shouldBlink && shouldBlink() && frameCount % 60 < 30){
    btnColor = "yellow";
  }
  
  // detect hover and set btnColor
  if (abs(mouseX - x) <= btnWidth/2 && 
      abs(mouseY - y) <= btnHeight/2){
    btnObj.isHovered = true;
    btnColor = "lime";
  }
  
  stroke(0);
  fill(btnColor); // btn color
  rect(x, y, btnWidth, btnHeight, 5);
  fill(0); noStroke();
  textSize(btnTextSize);
  text(btnText, x, y);
}

// for lost and won states
function setGameStatus(state){
  if (state !== "lost" && state !== "won") return;
  gameStatus = state;
  pickedMessage = random(
    state === "lost"? messagesJSON.loseMessages : messagesJSON.winMessages
  );
	SOUNDS_LIST[state==="lost"?"lose":"win"].file.play();
  messageStatus = "begin";
  messageAnimationProgress = 0;
}

function renderGrid(){
	strokeWeight(1);
	const NOISE_SCALE = 0.15;
  BASE_TILES.forEach(pos => {
		const [x,y] = calculateRenderPos(pos);
		const c = noise(
			(pos[0] + frameCount*0.01) * NOISE_SCALE,
			(pos[1] + frameCount*0.01) * NOISE_SCALE
		) * 50 + 10;
		fill(c);
		if (gridIsOn) stroke(150);
		else {
			const opacity = map(
				abs(dist(mouseX, mouseY, x, y)),
				0, 120, 255, 0
			);
			stroke(150,150,150,opacity)
		}
    renderTile([x,y])
  });
}

// load new level and load undo
function loadLevel(levelData, clearUndoList = false){
  if (clearUndoList) undoList = [];
  gameStatus = "playing";
	menuIsOpen = false;
  circlesList = [];
  powerCellsList = [];
  connectionsList = [];
  
  levelData.circles.forEach(pos => {
    circlesList.push({
      numberValue: null, isLocked: false, pos: pos, isHidden: false
    })
  });
  levelData.lockedCircles.forEach(pos => {
    circlesList.push({
      numberValue: null, isLocked: true, pos: pos, isHidden: false
    })
  });
  if (levelData.numberedCircles) {
    levelData.numberedCircles.forEach(([pos, num]) => {
      circlesList.push({
        numberValue: num, isLocked: false, pos: pos, isHidden: false
      })
    });
  }
  levelData.powerCells.forEach(pos => {
    powerCellsList.push(pos)
  });
  
  stopMoving();
}

let levelsJSON, messagesJSON;
let circleImg, circleLockedImg, circleNumberedImg, connectionImg, arrowImg, powerImg, titleImg;

function preload(){
  levelsJSON = loadJSON("levels.json");
  messagesJSON = loadJSON("messages.json");
  
  circleImg = loadImage('images/circle.png');
  circleLockedImg = loadImage('images/circleLocked.png');
  circleNumberedImg = loadImage('images/circleNumbered.png');
  connectionImg = loadImage('images/connection.png');
  arrowImg = loadImage('images/arrow.png');
  powerImg = loadImage('images/power.png');
	titleImg = loadImage('images/title.png');
  
  for (const name in SOUNDS_LIST){
    SOUNDS_LIST[name].file = loadSound(`sounds/${name}.mp3`, file=>{
      SOUNDS_LIST[name].file.setVolume(SOUNDS_LIST[name].vol)
    });
  }
}

function setup() {
  createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  imageMode(CENTER);
  rectMode(CENTER);
  angleMode(DEGREES);
  textAlign(CENTER, CENTER);
  textFont("monospace");
  frameRate(60); textSize(20);
  
  // setup levels data
	const levelsSolved = JSON.parse(localStorage.getItem("levelsSolved") || "[]");
  levelsData = levelsJSON.levels.map((lvObj,i) => ({
      lvObj: lvObj, 
			isSolved: levelsSolved[i]?true:false
  }));

	// set up level buttons
	levelsData.forEach((lvObj,index) => {
		const x = 50 + (index % 8) * 56;
		const y = 50 + floor(index / 8) * 40;
		levelBtns.push({
			isHovered: false,
			btnText: index+1, 
			btnTextSize: 20, 
			renderPos: [x, y], 
			btnWidth: 50, 
			btnHeight: 35,
			shouldRender: null,
			shouldBlink: ()=>!lvObj.isSolved,
			func: function(){
				currentLevelIndex = index;
				loadLevel(levelsData[currentLevelIndex].lvObj, true);
			}
		});
	})
	
  
  //loadLevel(levelsData[currentLevelIndex].lvObj, true);
}

function draw() {
  // reset
  background(BG_COLOR);
  hoveredCircle = null; hoveredDir = null;
  
  // reset buttons hover
	for (const btnName in allBtns){
		allBtns[btnName].isHovered = false;
	}
	levelBtns.forEach(btnObj => {btnObj.isHovered = false;});

	// renders title scene and skip the below
	if (isAtTitleScene){
		renderGrid();
		fill(0, 100, 0); // green
		TITLE_SCENE_POWER_CELLS.forEach(pos => {
			const [x,y] = calculateRenderPos(pos);
			stroke(0,250,5);
			renderTile([x,y])
			const imageScale = cos(
				(frameCount*0.9+pos[0]*30+pos[1]*30)
			);
			if (!circlesList.some(
				c => c.pos[0] === pos[0] && c.pos[1] === pos[1] && !c.isHidden
			)){
				renderImage(
					powerImg, 
					[x,y], 
					abs(imageScale)*0.6 // max size
				);
			}
		});
		image(titleImg,250,110,400,140);
		// text
		textSize(20); fill(250); noStroke();
		text("Click anywhere to begin", 250, 185);
		return;
	}

	// renders menu if open and skip the below
	if (menuIsOpen) {
		strokeWeight(2);
		levelBtns.forEach((lvBtnObj,index)=>{
			renderBtn(lvBtnObj);
		});
		// all solved? render this text
		if (levelsData.every(({isSolved})=>isSolved)){
			fill("lime"); textSize(18);
			text("Wow you really solved every single darn\nlevel! You must be highly intelligent!\nAnd extremely hate these yellow\nblinking buttons! Impressive!", 250,440);
		}
		return;
	}
  
  renderGrid();
  
  // renders the power cells
  fill(0, 100, 0); // green
  powerCellsList.forEach(pos => {
    const [x,y] = calculateRenderPos(pos);
    stroke(0,250,5);
    renderTile([x,y])
    const imageScale = cos(
      (frameCount*0.9+pos[0]*30+pos[1]*30)
    );
    if (!circlesList.some(
      c => c.pos[0] === pos[0] && c.pos[1] === pos[1] && !c.isHidden
    )){
      renderImage(
        powerImg, 
        [x,y], 
        abs(imageScale)*0.6 // max size
      );
    }
  });
  
  // renders explosions (also filter out the ones that are done exploding)
  noFill();
  strokeWeight(2);
  explosionsList = explosionsList.filter(explosion => {
    const [x, y] = calculateRenderPos(explosion.pos);
    const explosionSize = (explosion.animationProgress + 10) * TILE_SCALE * 0.2;
    stroke(250, 250, 250, map(
      explosion.animationProgress, 0, EXPLODING_DURATION,
      250, 0
    ));
    circle(x, y, explosionSize);
    return explosion.animationProgress++ <= EXPLODING_DURATION;
  })
  
  
  // renders connections
  circlesList.forEach(circleObj => {
    if (!circleObj.isHidden){
      const [x, y] = calculateRenderPos(circleObj.pos);
      if (!circleObj.isLocked) renderConnections(circleObj, [x,y]);
    }
  })
  
  // renders the circles (if not hidden)
  // renders numbered text
  textSize(25);  fill(0);  noStroke();
  circlesList.forEach(circleObj => {
    if (!circleObj.isHidden){
      const [x, y] = calculateRenderPos(circleObj.pos);
      let cImg = circleImg;
      if (circleObj.isLocked) cImg = circleLockedImg;
      else if (circleObj.numberValue !== null) cImg = circleNumberedImg;
      renderImage(cImg, [x,y]);
      
      if (circleObj.numberValue !== null) text(circleObj.numberValue, x,y);
    }
  })
  
  // renders red highlight when lose
  noFill(); stroke(250, 50, 50);
  strokeWeight(3);
  if (gameStatus === "lost" && frameCount % 60 < 30){
    circlesList.forEach(circleObj => {
      if (!isInsideGrid(circleObj.pos)){
        renderTile(calculateRenderPos(circleObj.pos));
      }
    });
  }
  
  // render buttons
  strokeWeight(2);
	for (const btnName in allBtns){
		renderBtn(allBtns[btnName]);
	}
  
  // render level text
  if (levelsData[currentLevelIndex].isSolved) fill(250,250,0);
  else fill(250);
  textSize(20);
  text(`Level ${1+currentLevelIndex}`, 70, 435);
  
  // render win/lose message (begin/middle/end)
  if (gameStatus === "won" || gameStatus === "lost"){
    let opacity, yFactor;
    // update messageStatus and messageAP
    if (messageStatus === "begin"){
      opacity = map(messageAnimationProgress, 0, MESSAGE_DURATION[0], 0, 255);
      yFactor = sin(map(
        messageAnimationProgress, 
        0, MESSAGE_DURATION[0],
        0, 90
      ));
      if (messageAnimationProgress < MESSAGE_DURATION[0]){
        messageAnimationProgress++;
      }
      else {
        messageStatus = "middle";
        messageAnimationProgress = 0;
      }
    }
    else if (messageStatus === "middle"){
      opacity = 255;
      yFactor = 1;
      if (messageAnimationProgress < MESSAGE_DURATION[1]){
        messageAnimationProgress++;
      }
      else {
        messageStatus = "end";
        messageAnimationProgress = 0;
      }
    }
    else if (messageStatus === "end"){
      opacity = map(messageAnimationProgress, 0, MESSAGE_DURATION[0], 255, 0);
      yFactor = sin(map(
        messageAnimationProgress, 
        0, MESSAGE_DURATION[0],
        90, 0
      ));
      if (messageAnimationProgress < MESSAGE_DURATION[0]){
        messageAnimationProgress++;
      }
    }
    
    fill(gameStatus === "won" ? color(0,250,0,opacity) : color(250,60,60,opacity));
    stroke(0,0,0,opacity);
    strokeWeight(5); 
    textSize(40);
    let yOffset = MESSAGE_MOVE_RANGE; // middle
    if (messageStatus === "begin") {
      yOffset = yFactor * MESSAGE_MOVE_RANGE;
    }
    else if (messageStatus === "end"){
      yOffset += MESSAGE_MOVE_RANGE -yFactor * MESSAGE_MOVE_RANGE;
    }
    text(pickedMessage, 250, 280 - yOffset);
  }
  
  // if lost or won, skip the below
  if (gameStatus !== "playing") return;
  
  // when not moving/animating AND not already lost
  if (!mc.isMoving){
    
    // renders arrows if selected a circle
    if (selectedCircle !== null){
      const [x,y] = calculateRenderPos(selectedCircle.pos);
      renderArrows([x,y]);
    }
    
    // checks circles hovered (if not already selected)
    if (selectedCircle === null){
      circlesList.forEach(circleObj => {
        if (circleObj.isLocked) return; // skip locked
        if (circleObj.numberValue !== null) return; // skip numbered
        const [x, y] = calculateRenderPos(circleObj.pos);
        if (tileIsHovered([x,y])){
          // renders highlight hover
          noFill(); stroke("lime"); strokeWeight(3);
          renderTile([x,y]);
          if (!circleObj.isLocked) hoveredCircle = circleObj;
        }
      })
    }
    
  }
  
  // when is moving and animating
  else if (mc.animationProgress > 0){
    const vel = mc.dirObj.vel;
    const animateFactor = map(mc.animationProgress, 0, MOVING_DURATION, 0, 1);
    
    // renders connections first
    mc.movingCircles.forEach(circleObj => {
      const animatedPos = [
        circleObj.pos[0] + vel[0] * animateFactor, 
        circleObj.pos[1] + vel[1] * animateFactor
      ]
      const [x, y] = calculateRenderPos(animatedPos);
      renderConnections(circleObj, [x,y], true, mc.movingCircles);
    })
    
    // renders circles second
    textSize(25);  fill(0);  noStroke();
    mc.movingCircles.forEach(circleObj => {
      const animatedPos = [
        circleObj.pos[0] + vel[0] * animateFactor, 
        circleObj.pos[1] + vel[1] * animateFactor
      ]
      const [x, y] = calculateRenderPos(animatedPos);
      let cirImg = circleImg;
      if (circleObj.numberValue !== null) cirImg = circleNumberedImg;
      renderImage(cirImg, [x,y]);
      if (circleObj.numberValue !== null) text(circleObj.numberValue, x,y);
    });
    if (mc.animationProgress < MOVING_DURATION){
      mc.animationProgress += 1;
      // done moving
      if (mc.animationProgress === MOVING_DURATION){
        recursiveMove();
      }
    }
  }
  
}

function mouseClicked(){
	if (isAtTitleScene){
		SOUNDS_LIST["music"].file.loop();
		return isAtTitleScene = false;
	}
  if (!mc.isMoving){
    // an arrow is clicked
    if (selectedCircle !== null && hoveredDir !== null){
      selectedDir = hoveredDir;
      initiateSlide()
      selectedCircle = null;
      SOUNDS_LIST["click"].file.play();
      return;
    }
    
    if (selectedCircle) selectedCircle = null;
    
    // a white circle is clicked
    if (hoveredCircle){
      selectedCircle = hoveredCircle;
      SOUNDS_LIST["click"].file.play();
      return;
    }
  }

	if (menuIsOpen){
		// a level button is clicked
    levelBtns.some(btnObj => {
      if (btnObj.isHovered){
        btnObj.func();
        SOUNDS_LIST["click"].file.play();
        return true;
      } else return false;
    });
		// no level button clicked
	} else {
		// a button is clicked
		const btnNames = Object.keys(allBtns);
    btnNames.some(btnName => {
			const btnObj = allBtns[btnName];
      if (btnObj.isHovered){
        btnObj.func();
        SOUNDS_LIST["click"].file.play();
        return true;
      } else return false;
    });
	}
}

function keyPressed(){
	if (isAtTitleScene || menuIsOpen) return;
	if (keyCode === 90){ // Z
		allBtns.undo.func();
		SOUNDS_LIST["click"].file.play();
	}
	else if (keyCode === 82){ // R
		allBtns.reset.func();
		SOUNDS_LIST["click"].file.play();
	}
}