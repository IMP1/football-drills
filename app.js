// https://www.petercollingridge.co.uk/tutorials/svg/interactive/dragging/
// https://stackoverflow.com/a/60714330/4173627

const SVG_NS = "http://www.w3.org/2000/svg";
const DRAGGABLE_CLASS = "draggable";
const SELECTABLE_CLASS = "selectable";
const ANIMATED_CLASS = "moveable";

const BALL_SIZE_GROUND = 10;
const BALL_SIZE_AIR = 14;

const DEFAULT_BALL_SPEED = 128; // px/second
const DEFAULT_PLAYER_SPEED = 96; // px/second

const PLAYER_ROLE_ATTACKER = 0;
const PLAYER_ROLE_DEFENDER = 1;
const PLAYER_ROLE_GOALKEEPER = 2;

const MOVEMENT_TYPE_PASS = "pass";
const MOVEMENT_TYPE_RUN = "run";
const MOVEMENT_TYPE_NOTE = "note";

const PASS_HEIGHT_GROUNDED = 0;
const PASS_HEIGHT_LOFTED = 1;

function getMousePosition(evt) {
    const svg = document.getElementById("field");
    var CTM = svg.getScreenCTM();
    if (evt.changedTouches) { 
        evt = evt.changedTouches[0]; 
    } else if (evt.touches) { 
        evt = evt.touches[0]; 
    }
    return {
        x: (evt.clientX - CTM.e) / CTM.a,
        y: (evt.clientY - CTM.f) / CTM.d
    };
}

function getDistance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function moveObject(obj, x, y) {
    let isGroup = false;
    if (!obj.classList.contains(DRAGGABLE_CLASS)) {
        if (obj.parentNode.classList.contains(DRAGGABLE_CLASS)) {
            isGroup = true;
        } else {
            return;
        }
    }
    
    if (isGroup) {
        obj = obj.parentNode;
    }

    const svg = document.getElementById("field");
    const transforms = obj.transform.baseVal;
    // Ensure the first transform is a translate transform
    if (transforms.length === 0 ||
        transforms.getItem(0).type !== SVGTransform.SVG_TRANSFORM_TRANSLATE) {
        // Create an transform that translates by (0, 0)
        let translate = svg.createSVGTransform();
        translate.setTranslate(0, 0);
        // Add the translation to the front of the transforms list
        obj.transform.baseVal.insertItemBefore(translate, 0);
    }
    // Get initial translation amount
    let transform = transforms.getItem(0);
    transform.setTranslate(x, y);
}

let settingUp = true;
let lastTouchMove = null;
let draggedElement = null;
let selectedElement = null;
let motionIndicator = null;
let offset;
let players = [];
let cones = [];
let balls = [];
let notes = [];
let setupPositions = {};
let timeline = {};

function deselectAll() {
    for (const list of document.getElementById("selected-item").getElementsByTagName("ul")[0].children) {
        list.classList.remove("visible");
    }
    document.getElementById("selected-item").classList.remove("visible");
    if (selectedElement) {
        selectedElement.classList.remove("selected");
    }
    selectedElement = null;
}

function selectElement(target) {
    let isGroup = false;
    if (!target.classList.contains(SELECTABLE_CLASS)) {
        if (target.parentNode.classList.contains(SELECTABLE_CLASS)) {
            isGroup = true;
        } else {
            return;
        }
    }

    deselectAll();
    selectedElement = target;
    if (isGroup) {
        selectedElement = target.parentNode;
    }
    selectedElement.classList.add("selected");
    console.log("Selecting element");
    console.log(selectedElement);

    for (const list of document.getElementById("selected-item").getElementsByTagName("ul")[0].children) {
        list.classList.remove("visible");
    }

    document.getElementById("selected-item").classList.add("visible");
    if (selectedElement.classList.contains("player")) {

        document.getElementById("selected-player").classList.add("visible");
        const player = selectedElement;
        const numberEdit = document.getElementById("selected-player-number");
        const roleEdit = document.getElementById("selected-player-role");
        numberEdit.value = parseInt(player.getElementsByTagName("text")[0].textContent);
        roleEdit.value = parseInt(player.dataset.role);
        numberEdit.onchange = function() {
            player.getElementsByTagName("text")[0].textContent = numberEdit.value.toString();
        };
        roleEdit.onchange = function() {
            player.dataset.role = roleEdit.value;
        };

    } else if (selectedElement.classList.contains("cone")) {
        
        document.getElementById("selected-cone").classList.add("visible");
        const cone = selectedElement;
        const colourEdit = document.getElementById("selected-cone-colour");
        colourEdit.value = parseInt(cone.dataset.colour);
        colourEdit.onchange = function() {
            cone.dataset.colour = colourEdit.value;
        };

    } else if (selectedElement.classList.contains("note")) {
        
        document.getElementById("selected-note").classList.add("visible");
        const noteEvent = timeline[selectedElement.dataset.eventTime][selectedElement.dataset.eventIndex];
        const note = notes[noteEvent.entityId];
        const textEdit = document.getElementById("selected-note-text");
        textEdit.value = note.text;
        textEdit.oninput = function() {
            note.text = textEdit.value;
            refreshCurrentNote();
        };

    } else if (selectedElement.classList.contains("movement")) {
        
        const movementEvent = timeline[selectedElement.dataset.eventTime][selectedElement.dataset.eventIndex];
        
        if (movementEvent.type === MOVEMENT_TYPE_PASS) {
            document.getElementById("selected-pass").classList.add("visible");
            const distance = getDistance(movementEvent.origin, movementEvent.destination);
            const defaultSpeed = movementEvent.type === MOVEMENT_TYPE_PASS ? DEFAULT_BALL_SPEED : DEFAULT_PLAYER_SPEED;
            const defaultDuration = Math.floor((distance / defaultSpeed) * 100 + 50) / 100;
            const duration = movementEvent.endTime - movementEvent.startTime;
            const durationEdit = document.getElementById("selected-pass-duration");
            const heightEdit = document.getElementById("selected-pass-height");
            document.getElementById("selected-pass-default-duration").value = defaultDuration;
            heightEdit.value = movementEvent.height;
            heightEdit.onchange = function() {
                movementEvent.height = parseInt(heightEdit.value);
            };
            durationEdit.max = defaultDuration * 2;
            durationEdit.value = duration;
            durationEdit.onchange = function() {
                movementEvent.endTime = movementEvent.startTime + durationEdit.valueAsNumber;
                const bar = document.getElementById("timeline-bar");
                if (bar.max < movementEvent.endTime) {
                    bar.max = movementEvent.endTime;
                }
                refreshTimelineEvents();
            };

        } else if (movementEvent.type === MOVEMENT_TYPE_RUN) {
            document.getElementById("selected-run").classList.add("visible");
            const distance = getDistance(movementEvent.origin, movementEvent.destination);
            const defaultSpeed = movementEvent.type === MOVEMENT_TYPE_PASS ? DEFAULT_BALL_SPEED : DEFAULT_PLAYER_SPEED;
            const defaultDuration = Math.floor((distance / defaultSpeed) * 100 + 50) / 100;
            const duration = movementEvent.endTime - movementEvent.startTime;
            document.getElementById("selected-run-default-duration").value = defaultDuration;
            const durationEdit = document.getElementById("selected-run-duration");
            durationEdit.max = defaultDuration * 2;
            durationEdit.value = duration;
            durationEdit.onchange = function() {
                movementEvent.endTime = movementEvent.startTime + durationEdit.valueAsNumber;
                const bar = document.getElementById("timeline-bar");
                if (bar.max < movementEvent.endTime) {
                    bar.max = movementEvent.endTime;
                }
                refreshTimelineEvents();
            };
        }

    } else if (selectedElement.classList.contains("ball")) {

        document.getElementById("selected-ball").classList.add("visible");

    } else {
        document.getElementById("selected-item").classList.remove("visible");
    }
}

function deleteSelectedItem() {
    if (!selectedElement) return;

    console.log("Deleting selected item");
    if (selectedElement.classList.contains("player")) {

        for (const [startTime, eventList] of Object.entries(timeline)) {
            for (let i = eventList.length - 1; i >= 0; i --) {
                const event = eventList[i];
                if (event.entityId === selectedElement.id) {
                    timeline[startTime].splice(i, 1);
                }
            }
        }
        delete setupPositions[selectedElement.id];
        selectedElement.remove();
        refreshTimelineEvents();

    } else if (selectedElement.classList.contains("ball")) {

        for (const [startTime, eventList] of Object.entries(timeline)) {
            for (let i = eventList.length - 1; i >= 0; i --) {
                const event = eventList[i];
                if (event.entityId === selectedElement.id) {
                    timeline[startTime].splice(i, 1);
                }
            }
        }
        delete setupPositions[selectedElement.id];
        selectedElement.remove();
        refreshTimelineEvents();

    } else if (selectedElement.classList.contains("cone")) {

        delete setupPositions[selectedElement.id];
        selectedElement.remove();

    } else if (selectedElement.classList.contains("note")) {
        
        const event = timeline[selectedElement.dataset.eventTime][selectedElement.dataset.eventIndex];
        const note = notes[event.entityId];
        notes.splice(event.entityId, 1);
        timeline[selectedElement.dataset.eventTime].splice(selectedElement.dataset.eventIndex, 1);
        refreshTimelineEvents();
        refreshCurrentNote();

    } else if (selectedElement.classList.contains("movement")) {
        
        const event = timeline[selectedElement.dataset.eventTime][selectedElement.dataset.eventIndex];
        console.log(event);
        timeline[selectedElement.dataset.eventTime].splice(selectedElement.dataset.eventIndex, 1);
        refreshTimelineEvents();
    }
    deselectAll();
}

function startDrag(evt) {
    if (evt.ctrlKey) {
        startMotion(evt);
        return;
    }
    if (!settingUp) {
        return;
    }
    let isGroup = false;
    if (!evt.target.classList.contains(DRAGGABLE_CLASS)) {
        if (evt.target.parentNode.classList.contains(DRAGGABLE_CLASS)) {
            isGroup = true;
        } else {
            return;
        }
    }
    
    draggedElement = evt.target;
    if (isGroup) {
        draggedElement = evt.target.parentNode;
    }
    const svg = document.getElementById("field");
    offset = getMousePosition(evt);
    // Get all the transforms currently on this element
    let transforms = draggedElement.transform.baseVal;
    // Ensure the first transform is a translate transform
    if (transforms.length === 0 ||
        transforms.getItem(0).type !== SVGTransform.SVG_TRANSFORM_TRANSLATE) {
        // Create an transform that translates by (0, 0)
        let translate = svg.createSVGTransform();
        translate.setTranslate(0, 0);
        // Add the translation to the front of the transforms list
        draggedElement.transform.baseVal.insertItemBefore(translate, 0);
    }
    // Get initial translation amount
    let transform = transforms.getItem(0);
    offset.x -= transform.matrix.e;
    offset.y -= transform.matrix.f;
}

function moveDrag(evt) {
    if (!draggedElement) return;
    evt.preventDefault();
    let coord = getMousePosition(evt);
    const x = coord.x - offset.x;
    const y = coord.y - offset.y;
    moveObject(draggedElement, x, y)
    setupPositions[draggedElement.id] = {"x": x, "y": y};
}

function endDrag(evt) {
    if (!draggedElement) return;
    draggedElement = null;
}

function startMotion(evt) {
    let isGroup = false;
    if (!evt.target.classList.contains(ANIMATED_CLASS)) {
        if (evt.target.parentNode.classList.contains(ANIMATED_CLASS)) {
            isGroup = true;
        } else {
            return;
        }
    }
    let element = evt.target;
    let type = MOVEMENT_TYPE_PASS;
    if (isGroup) {
        element = evt.target.parentNode;
        type = MOVEMENT_TYPE_RUN;
    }
    
    const svg = document.getElementById("field");
    let arrow = document.createElementNS(SVG_NS, "path");
    arrow.setAttribute("id", "motion-arrow");
    arrow.setAttribute("marker-end", "url(#arrow-head)");
    svg.appendChild(arrow);

    motionIndicator = {"origin": null, "destination": null, "entity": element, "type": type, "arrowElement": arrow};
    motionIndicator.origin = getMousePosition(evt);
}

function moveMotion(evt) {
    if (!motionIndicator) return;
    evt.preventDefault();
    motionIndicator.destination = getMousePosition(evt);
    const arrow = motionIndicator.arrowElement;

    const ox = motionIndicator.origin.x;
    const oy = motionIndicator.origin.y;
    const tx = motionIndicator.destination.x;
    const ty = motionIndicator.destination.y;

    arrow.setAttribute("d", `M${ox} ${oy} L${tx} ${ty}`)
}

function endMotion(evt) {
    if (!motionIndicator) return;

    const time = document.getElementById("timeline-bar").valueAsNumber;
    motionIndicator.arrowElement.remove();
    motionIndicator.destination = getMousePosition(evt);

    console.log(motionIndicator);
    if (motionIndicator.type === "run") {
        const player = motionIndicator.entity;
        const timeNow = time;
        const origin = motionIndicator.origin;
        const destination = motionIndicator.destination;
        addRun(player, timeNow, origin, destination);
    } else if (motionIndicator.type === "pass") {
        const ball = motionIndicator.entity;
        const timeNow = time;
        const origin = motionIndicator.origin;
        const destination = motionIndicator.destination;
        addPass(ball, timeNow, origin, destination);
    }

    motionIndicator = null;
}


function addPlayer() {
    console.log("Adding player " + (players.length + 1));
    const field = document.getElementById("field");
    const player = document.createElementNS(SVG_NS, "g");
    player.id = "player-" + (players.length + 1);
    player.classList.add(DRAGGABLE_CLASS);
    player.classList.add(ANIMATED_CLASS);
    player.classList.add(SELECTABLE_CLASS);
    player.classList.add("player");
    player.dataset.role = PLAYER_ROLE_ATTACKER;
    // TODO: Other player data?
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("r", "16");
    player.appendChild(circle);
    const number = document.createElementNS(SVG_NS, "text");
    number.textContent = (players.length + 1).toString();
    number.setAttribute("x", "0");
    number.setAttribute("y", "0");
    number.setAttribute("font-size", "16");
    number.setAttribute("font-weight", "bold");
    number.setAttribute("fill", "currentColor");
    number.setAttribute("text-anchor", "middle");
    number.setAttribute("alignment-baseline", "middle");
    player.appendChild(number);
    field.appendChild(player);
    players.push(player);
    moveObject(player, 24, 24);
    // Move balls to top
    for (const b of balls) {
        b.parentNode.appendChild(b);
    }
    selectElement(player);
}

function addCone() {
    console.log("Adding cone");
    const field = document.getElementById("field");
    const cone = document.createElementNS(SVG_NS, "path");
    cone.id = "cone-" + (cones.length + 1);
    const path = "M 8 10 L 16 24 C 12 26 4 26 0 24 Z";
    cone.setAttribute("d", path);
    cone.classList.add(DRAGGABLE_CLASS);
    cone.classList.add(SELECTABLE_CLASS);
    cone.classList.add("cone");
    cone.dataset.colour = 0;
    field.appendChild(cone);
    cones.push(cone);
    moveObject(cone, 100, 24);
    // Move players above cones
    for (const p of players) {
        p.parentNode.appendChild(p);
    }
    // Move balls to top
    for (const b of balls) {
        b.parentNode.appendChild(b);
    }
    selectElement(cone);
}

function addBall() {
    console.log("Adding ball");
    const field = document.getElementById("field");
    const ball = document.createElementNS(SVG_NS, "circle");
    ball.id = "ball-" + (balls.length + 1);
    ball.setAttribute("r", BALL_SIZE_GROUND);
    ball.classList.add(DRAGGABLE_CLASS);
    ball.classList.add(ANIMATED_CLASS);
    ball.classList.add(SELECTABLE_CLASS);
    ball.classList.add("ball");
    field.appendChild(ball);
    balls.push(ball);
    moveObject(ball, 100, 200);
    selectElement(ball);
}

function addNote() {
    // TODO: Check if there's a note at the same time, and if so don't do anything
    console.log("Adding note");
    const time = document.getElementById("timeline-bar").valueAsNumber;
    let endTime = parseFloat(document.getElementById("timeline-bar").max);

    for (const prevNote of notes.filter(n => n.startTime < time && n.endTime >= time)) {
        prevNote.endTime = time - 0.1;
    }
    endTime = notes.filter(n => n.startTime > time).reduce((earliestTime, n) => n.startTime < earliestTime ? n.startTime : earliestTime, endTime);

    const note = {
        text: "Note " + (notes.length + 1),
        startTime: time,
        endTime: endTime
    };
    notes.push(note);

    if (!timeline[time]) {
        timeline[time] = [];
    }
    timeline[time].push({
        "type": MOVEMENT_TYPE_NOTE,
        "entityId": notes.length - 1,
        "origin": null,
        "destination": null,
        "startTime": time,
        "endTime": endTime
    });
    refreshTimelineEvents();
    refreshCurrentNote();
    // Select new note
    const eventsAtTime = [...document.getElementById("timeline-events").getElementsByClassName("note")].filter(function(img) {
        return parseFloat(img.dataset.eventTime) === time;
    });
    console.log(eventsAtTime);
    const icon = eventsAtTime[eventsAtTime.length - 1];
    selectElement(icon);
}

function addPass(ball, time, origin, destination) {
    addMovement(MOVEMENT_TYPE_PASS, ball, time, origin, destination, DEFAULT_BALL_SPEED);
}

function addRun(player, time, origin, destination) {
    addMovement(MOVEMENT_TYPE_RUN, player, time, origin, destination, DEFAULT_PLAYER_SPEED);
}

function addMovement(type, entity, time, origin, destination, speed) {
    console.log("Adding " + type);
    const duration = getDistance(origin, destination) / speed;
    if (!timeline[time]) {
        timeline[time] = [];
    }
    const event = {
        "type": type,
        "entityId": entity.id,
        "origin": origin,
        "destination": destination,
        "startTime": time,
        "endTime": time + duration
    };
    if (type === MOVEMENT_TYPE_PASS) {
        event.height = PASS_HEIGHT_GROUNDED;
    }
    timeline[time].push(event);
    const bar = document.getElementById("timeline-bar");
    if (bar.max < time + duration) {
        bar.max = time + duration;
    }
    refreshTimelineEvents();
    // Select new motion
    const eventsAtTime = [...document.getElementById("timeline-events").children].filter(function(img) {
        console.log(img.dataset.eventTime);
        console.log(typeof(img.dataset.eventTime));
        console.log(time);
        console.log(typeof(time));
        return parseFloat(img.dataset.eventTime) === time;
    });
    console.log(eventsAtTime);
    const icon = eventsAtTime[eventsAtTime.length - 1];
    selectElement(icon);
}

function addPause(time, duration) {
    const bar = document.getElementById("timeline-bar");
    if (bar.max < time + duration) {
        bar.max = time + duration;
    }
    refreshTimelineEvents();
}

function refreshTimelineEvents() {
    const events = document.getElementById("timeline-events");

    while (events.firstChild) {
        events.lastChild.remove();
    }

    const w = document.getElementById("timeline-bar").offsetWidth;
    const t = document.getElementById("timeline-bar").max;

    let rows = [[]];

    function timelineClash(rowIndex, startTime, endTime) {
        if (rows[rowIndex].length === 0) return false;
        return (rows[rowIndex].filter(slot => !(slot.endTime < startTime || slot.startTime > endTime))).length > 0;
    }

    let yOffset = 0;
    if (notes.length > 0) {
        yOffset += 48;
    }

    for (const [startTime, eventList] of Object.entries(timeline)) {
        for (let i = 0; i < eventList.length; i ++) {
            const event = eventList[i];
            if (event.type === MOVEMENT_TYPE_NOTE) {
                const icon = document.createElementNS(SVG_NS, "image");
                icon.classList.add(SELECTABLE_CLASS);
                icon.classList.add("note");
                icon.setAttribute("x", w * event.startTime / t);
                icon.setAttribute("y", 0);
                icon.setAttribute("width", 32);
                icon.setAttribute("height", 32);
                icon.dataset.eventTime = startTime;
                icon.dataset.eventIndex = i;
                icon.setAttribute("href", "icon_note.svg");
                icon.addEventListener("click", function() { selectElement(icon); });
                events.appendChild(icon);
                continue;
            }

            let row = 0;
            while (timelineClash(row, event.startTime, event.endTime)) {
                row += 1;
                if (row >= rows.length) {
                    rows.push([]);
                }
            }
            rows[row].push({startTime: event.startTime, endTime: event.endTime});

            const y = row * 24;
            // TODO: Have a run icon and a pass icon
            const icon = document.createElementNS(SVG_NS, "circle");
            icon.setAttribute("cx", w * event.startTime / t + 8);
            icon.setAttribute("cy", y + yOffset);
            icon.setAttribute("r", 8);
            if (event.type === "pass") {
                icon.setAttribute("fill", "white");
            } else if (event.type === "run") {
                icon.setAttribute("fill", "black");
            } else {
                icon.setAttribute("fill", "red");
            }
            icon.classList.add(SELECTABLE_CLASS);
            icon.classList.add("movement");
            icon.dataset.eventTime = startTime;
            icon.dataset.eventIndex = i;
            icon.addEventListener("click", function() { selectElement(icon); });
            events.appendChild(icon);
            const line = document.createElementNS(SVG_NS, "line");
            line.setAttribute("x1", w * event.startTime / t + 14);
            line.setAttribute("y1", y + yOffset);
            line.setAttribute("x2", w * event.endTime / t);
            line.setAttribute("y2", y + yOffset);
            line.setAttribute("stroke-width", "8");
            if (event.type === "pass") {
                line.setAttribute("stroke", "white");
            } else if (event.type === "run") {
                line.setAttribute("stroke", "black");
            } else {
                line.setAttribute("stroke", "red");
            }
            events.appendChild(line);
        }
    }
}

function refreshCurrentNote() {
    document.getElementById("current-note-text").innerText = "";
    const time = document.getElementById("timeline-bar").value;
    const currentNote = notes.filter(n => n.startTime <= time).filter(n => n.endTime >= time)[0];
    if (currentNote) {
        document.getElementById("current-note-text").innerText = currentNote.text;
    }
}

function scrubToTime(time) {
    settingUp = (time == 0);

    for (let entityId of Object.keys(setupPositions)) {
        const pos = setupPositions[entityId];
        const entity = document.getElementById(entityId);
        moveObject(entity, pos.x, pos.y);
    }

    const times = Object.keys(timeline).map(parseFloat);
    let currentTime = 0;
    let nextTime;
    if (Object.keys(timeline).length === 0) return;
    while (currentTime <= time) {
        const events = timeline[currentTime];
        for (const event of events) {
            if (event.type === MOVEMENT_TYPE_NOTE) {
                continue;
            }
            const entity = document.getElementById(event.entityId);            
            if (event.endTime < time) {
                moveObject(entity, event.destination.x, event.destination.y);
            } else {
                const t = (time - event.startTime) / (event.endTime - event.startTime);
                const x = event.destination.x * t + event.origin.x * (1-t);
                const y = event.destination.y * t + event.origin.y * (1-t);
                moveObject(entity, x, y);
                if (event.type === MOVEMENT_TYPE_PASS && event.height === PASS_HEIGHT_LOFTED) {
                    const duration = event.endTime - event.startTime;
                    const sqrtDifference = Math.sqrt(BALL_SIZE_AIR - BALL_SIZE_GROUND);
                    const scale = BALL_SIZE_AIR - Math.pow(sqrtDifference * (2 * t - 1), 2);
                    entity.setAttribute("r", scale);
                }

            }
        }
        if (times.filter(t => t > currentTime).length === 0) {
            break; // We've done the last one
        }
        nextTime = times.filter(t => t > currentTime).reduce((lowest, t) => t < lowest ? t : lowest);
        currentTime = nextTime;
    }
    refreshCurrentNote();
}


// From https://stackoverflow.com/questions/30106476/using-javascripts-atob-to-decode-base64-doesnt-properly-decode-utf-8-strings
function b64EncodeUnicode(str) {
    // first we use encodeURIComponent to get percent-encoded Unicode,
    // then we convert the percent encodings into raw bytes which
    // can be fed into btoa.
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode('0x' + p1);
    }));
}

function b64DecodeUnicode(str) {
    // Going backwards: from bytestream, to percent-encoding, to original string.
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

const DATA_META_SIZE = 8;
const DATA_CONE_SIZE = 4;
const DATA_PLAYER_SIZE = 4;
const DATA_BALL_SIZE = 2;
const DATA_MOMENT_SIZE = 12;

function getDrillUrl() {
    let url = window.location.pathname;
    url += "?d=";

    const drill = {
        height: document.getElementById("field-container").offsetHeight,
        cones: cones.map(c => ({
            id: c.id,
            colour: c.dataset.colour
        })),
        players: players.map(p => ({
            id: p.id,
            role: p.dataset.role,
            number: p.getElementsByTagName("text")[0].textContent
        })),
        balls: balls.length,
        notes: notes,
        setupPositions: setupPositions,
        timeline: timeline,
        duration: document.getElementById("timeline-bar").max
    }
    const base64 = b64EncodeUnicode(JSON.stringify(drill));
    console.log(base64);
    url += base64;
    window.open(url);
    return url;
}

function loadDrillFromUrl() {
    const queryString = window.location.search;
    if (!queryString) return false;
    const urlParams = new URLSearchParams(queryString);
    if (!urlParams.has("d")) return false;
    const drillString = urlParams.get("d");
    const drillJson = b64DecodeUnicode(drillString);
    const drill = JSON.parse(drillJson);
    
    console.log(drill);

    console.log(document.getElementById("field-container"));
    document.getElementById("field-container").style.height = "" + drill.height + "px";
    console.log("" + drill.height + "px");
    console.log(document.getElementById("field-container"));

    for (let i = 0; i < drill.cones.length; i ++) {
        addCone();
    }
    for (let i = 0; i < drill.cones.length; i ++) {
        const cone = cones[i];
        cone.id = drill.cones[i].id;
        cone.dataset.colour = drill.cones[i].colour;
    }

    for (let i = 0; i < drill.players.length; i ++) {
        addPlayer();
    }
    console.log(drill.players);
    for (let i = 0; i < drill.players.length; i ++) {
        console.log(drill.players[i]);
        const player = players[i];
        player.id = drill.players[i].id;
        player.dataset.role = drill.players[i].role;
        player.getElementsByTagName("text")[0].textContent = drill.players[i].number;
    }

    for (let i = 0; i < drill.balls; i ++) {
        addBall();
    }
    notes = drill.notes;
    setupPositions = drill.setupPositions;
    timeline = drill.timeline;
    document.getElementById("timeline-bar").max = parseFloat(drill.duration);

    refreshTimelineEvents();
    refreshCurrentNote();
    document.getElementById("timeline-bar").value = 0;
    scrubToTime(0);
    deselectAll();

    return true;
}

function setup() {
    const svg = document.getElementById("field");
    document.getElementById("add-player").addEventListener("click", addPlayer);
    document.getElementById("add-cone").addEventListener("click", addCone);
    document.getElementById("add-ball").addEventListener("click", addBall);
    document.getElementById("add-note").addEventListener("click", addNote);
    document.getElementById("share-drill").addEventListener("click", getDrillUrl);
    document.getElementById("add-time").addEventListener("click", function() { addPause(parseFloat(document.getElementById("timeline-bar").max), 1.0) });
    document.getElementById("reset-time").addEventListener("click", function() { document.getElementById("timeline-bar").value = 0; scrubToTime(0); });
    svg.addEventListener("mousedown", startDrag);
    svg.addEventListener("mousemove", moveDrag);
    svg.addEventListener("mousemove", moveMotion);
    svg.addEventListener("mouseup", endDrag);
    svg.addEventListener("mouseup", endMotion);
    svg.addEventListener("mouseleave", endDrag);
    svg.addEventListener("mouseleave", endMotion);
    svg.addEventListener('touchstart', startDrag);
    svg.addEventListener('touchmove', moveDrag);
    svg.addEventListener('touchmove', moveMotion);
    svg.addEventListener('touchend', endDrag);
    svg.addEventListener('touchend', endMotion);
    svg.addEventListener('touchleave', endDrag);
    svg.addEventListener('touchleave', endMotion);
    svg.addEventListener('touchcancel', endDrag);
    svg.addEventListener('touchcancel', endMotion);
    svg.addEventListener('click', function(evt) { selectElement(evt.target); });
    // document.getElementById("timeline-bar").addEventListener("change", scrubToTime);
    document.getElementById("timeline-bar").addEventListener("input", function() { scrubToTime(document.getElementById("timeline-bar").value); });
    document.getElementById("delete-selected-item").addEventListener("click", deleteSelectedItem);
    addEventListener("resize", refreshTimelineEvents);
    document.addEventListener("keydown", function(evt) {
        evt = evt || window.event;
        var isEscape = false;
        if ("key" in evt) {
            isEscape = (evt.key === "Escape" || evt.key === "Esc");
        } else {
            isEscape = (evt.keyCode === 27);
        }
        if (isEscape) {
            deselectAll();
        }
    });

    if (!loadDrillFromUrl()) {
        addPlayer();
        addBall();        
        deselectAll();
    }

}

setup();