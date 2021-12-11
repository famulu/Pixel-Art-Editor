
class Picture {
    // A Picture instance holds 3 properties: 
    //   its height (px), its width (px) and the color of each pixel.
    // The colors of the pixels are stored in an array left to right, top to bottom
    constructor(pixelsGrid, width, height) {
        this.pixelsGrid = pixelsGrid;
        this.width = width;
        this.height = height;
    }
    static create(width, height, color) {
        const pixelsGrid = new Array(height).fill(new Array(width).fill(color));
        return new Picture(pixelsGrid, width, height);
    }
    update(pixels) {
        // A pixel is an object with an 'x', a 'y' and a 'color' value
        // A 'color' value is in the format "#rrggbb"
        const newPixelsGrid = this.pixelsGrid.map(row => row.slice());
        pixels.forEach( ({y, x, color}) => newPixelsGrid[y][x] = color );
        return new Picture(newPixelsGrid, this.width, this.height);
    }
}

function updateState(currentState, updatedProperties) {
    // A state is an object that holds the current tool, color and picture
    // return Object.assign({}, currentState, updatedProperties);
    return {...currentState, ...updatedProperties};
}

function createElement(tagName, properties, ...children) {
    const element = document.createElement(tagName);
    Object.assign(element, properties); // Might not work
    for (const child of children) {
        try {
            element.appendChild( typeof child === "string" ? document.createTextNode(child) : child );
        } catch (error) {
            console.log("ERROR!");
            console.log(children);
            console.log(child);
            console.log(element);
        }
    }
    return element;
}

const SCALE = 10;

class PictureCanvas {
    constructor(picture, eventFunction) {
        this.element = createElement("canvas", {
            // Creating a mouse down event listener
            onmousedown: event => this.clicked(event, eventFunction)
        });
        this.sync(picture);
    }
    sync(picture) {
        if (this.picture !== picture) {
            this.picture = picture;
            drawPicture(this.picture, this.element, SCALE);
        }
    }
}

function drawPicture(picture, canvas) {
    canvas.width = picture.width * SCALE;
    canvas.height = picture.height * SCALE;
    const cx = canvas.getContext("2d");

    for (let y = 0; y < picture.height; y++) {
        for (let x = 0; x < picture.width; x++) {
            cx.fillStyle = picture.pixelsGrid[y][x];
            cx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
        }
    }
}

PictureCanvas.prototype.clicked = function(clickEvent, clickFunction) {
    // Only accept left mouse clicks
    if (clickEvent.button !== 0) return;
    let position = getPosition(clickEvent, this.element);
    const moveFunction = clickFunction(position);
    if (!moveFunction) return; // !!!!!!!
    let move = (moveEvent) => {
        if (moveEvent.buttons == 0) {
            // mouse is moving but no buttons are being held down
            this.element.removeEventListener("mousemove", move);
        } else {
            const newPosition = getPosition(moveEvent, this.element);
            if (newPosition.x == position.x && newPosition.y == position.y) return;
            position = newPosition;
            moveFunction(newPosition);
        }
    }
    this.element.addEventListener("mousemove", move);
};


function getPosition(event, node) {
    // Returns x and y of the pixelGrid box that was clicked
    const rect = node.getBoundingClientRect();
    return {
        x: Math.floor((event.clientX - rect.left) / SCALE),
        y: Math.floor((event.clientY - rect.top) / SCALE)
    };
}

class PixelEditor {
    // This is the main interface
    constructor(state, configuration) {
        const {tools, controls, dispatchFunction} = configuration;
        this.state = state;

        this.canvas = new PictureCanvas(this.state.picture, position => {
            const activeTool = tools[this.state.tool];
            const onMove = activeTool(position, this.state, dispatchFunction);
            if (onMove) return position => onMove(position, this.state);
        });

        this.controls = controls.map(
            Control => new Control(this.state, configuration)
        );

        this.element = createElement(
            "div", 
            {}, 
            this.canvas.element, 
            createElement("br"),
            ...[" "].concat(...this.controls.map(control => [control.element, " "]))
        );
    }
    sync(state) {
        this.state = state;
        this.canvas.sync(this.state.picture);
        for (const ctrl of this.controls) ctrl.sync(state);
    }
}

class ToolSelect {
    constructor(state, {tools, dispatchFunction}) {
        this.select = createElement(
            "select",
            {onchange: () => dispatchFunction({tool: this.select.value})},
            ...Object.keys(tools).map(toolName => createElement("option", {selected: toolName === state.tool}, toolName))
        );

        this.element = createElement("label", {}, "🖌 Tool: ", this.select);
    }
    sync(state) {
        this.select.value = state.tool;
    }
}

class ColorSelect {
    constructor(state, {dispatchFunction}) {
        this.input = createElement(
            "input",
            {
                type: "color",
                value: state.color,
                onchange: () => {
                    console.log("Color is being changed.");
                    dispatchFunction({color: this.input.value});
                }
            }
        );
        
        this.element = createElement("label", {}, "🎨 Color: ", this.input);
    }
    sync(state) {
        this.input.value = state.color;
    }
}

function paint(position, state, dispatchFunction) {
    function paintPixel({x, y}, state) {
        const newPixel = {x, y, color: state.color};
        dispatchFunction({picture: state.picture.update([newPixel])});
    }
    paintPixel(position, state);
    return paintPixel;
}

function rectangle(start, state, dispatchFunction) {
    function paintRect(position) {
        const rectStart = {
            x: Math.min(start.x, position.x),
            y: Math.min(start.y, position.y)
        };
        const rectEnd = {
            x: Math.max(start.x, position.x),
            y: Math.max(start.y, position.y)
        };
        const updatedPixels = [];
        for (let y = rectStart.y; y <= rectEnd.y; y++) {
            for (let x = rectStart.x; x <= rectEnd.x; x++) {
                updatedPixels.push({x, y, color: state.color});
            }
        }
        // Due to the closure, the 'state' that is passed to paintRect() is the original state aka the state when mouse was first clicked
        dispatchFunction({picture: state.picture.update(updatedPixels)});
    }
    paintRect(start);
    return paintRect;
}

const neighbors = [
    {dx: 1, dy: 0},
    {dx: 0, dy: 1},
    {dx: -1, dy: 0},
    {dx: 0, dy: -1}
];

function floodFill({x, y}, state, dispatchFunction) {
    // Change the color of all pixels that are of targetedColor and 
    // are x/y adjacent to the clicked pixel
    const targetedColor = state.picture.pixelsGrid[y][x];
    const updatedPixels = [{x, y, color: state.color}];
    const visited = new Set();
    for (let i = 0; i < updatedPixels.length; i++) {
        for (const {dy, dx} of neighbors) {
            const x = updatedPixels[i].x + dx, y = updatedPixels[i].y + dy;
            if (state.picture.pixelsGrid[y] && state.picture.pixelsGrid[y][x] === targetedColor && !visited.has(`${x},${y}`)) {
                visited.add(`${x},${y}`);
                updatedPixels.push({x, y, color: state.color});
            }
        }
    }

    dispatchFunction({picture: state.picture.update(updatedPixels)});
}

function pickColor(position, state, dispatchFunction) {
    dispatchFunction({color: state.picture.pixelsGrid[position.y][position.x]});
}
