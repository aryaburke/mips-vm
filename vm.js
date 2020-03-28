let ULAM = `li $s0,**STARTING VALUE**
li $t0,1
li $t1,3
j U_S
ULAM: addi $s1,$s1,1
U_S: beq $s0,$t0,END
andi $t2,$s0,1
beq $t2,$zero,EVEN
mult $s0,$t1
mflo $s0
addi $s0,$s0,1
j ULAM
EVEN: srl $s0,$s0,1
j ULAM
END: addi $a0,$s1,0`;

let g = {};

/*initialization functions*/

function init() {
    initRegisters();
    g.textArea = document.getElementById('inbound');
    g.outElement = document.getElementById('outbound');
    g.table = document.getElementById('registerTable');
    g.bAssemble = document.getElementById('assemble');
    g.bRun = document.getElementById('run');
    g.bStep = document.getElementById('step');
    g.bUlam = document.getElementById('ulam');
    g.slider = document.getElementById('speedSlider');
    g.speedText = document.getElementById('speedText');
    g.output = document.getElementById('instructionOutput');
    g.errorText = document.getElementById('error');

    g.mem = {};
    g.sym = {};
    g.lines = [];
    g.breakpoints = [];
    g.code = '';
    g.error = null;
    g.running = false;
    g.increment = 1;
    g.maxInstructions = 2000;
    g.displayAbove = 500; //the value above which to display lines being executed
    g.toDisplay = 10; //number of lines to display onscreen
    g.instructionDelay = g.slider.value;
    if (g.instructionDelay > 1) {
        //integer division to get rid of annoying extra .001
        g.instructionDelay = Math.floor(g.instructionDelay/1);
    }

    speedText.innerText = `RUN SPEED: ${g.instructionDelay} ms`;
    g.slider.addEventListener('input', function() {
        g.instructionDelay = g.slider.value;
        if (g.instructionDelay > 1) {
            g.instructionDelay = Math.floor(g.instructionDelay/1);
        }
        speedText.innerText = `RUN SPEED: ${g.instructionDelay} ms`;
    });
}

function initRegisters() {
    let reg = {};
    reg.$zero = 0;
    reg.$v0 = 0;
    reg.$v1 = 0;
    for (let i = 0; i <= 3; i++) {
        reg[`$a${i}`] = 0;
    }
    for (let i = 0; i <= 7; i++) {
        reg[`$t${i}`] = 0;
    }
    for (let i = 0; i <= 7; i++) {
        reg[`$s${i}`] = 0;
    }
    reg.$t8 = 0;
    reg.$t9 = 0;
    reg.$sp = 0;
    reg.$ra = 0;
    reg.hi = 0;
    reg.lo = 0;
    reg.pc = 0;
    g.reg = reg;
}





/*backend assembly functions*/

function firstPass() {
    g.sym = {};
    g.lines = g.textArea.value.split('\n');
    g.code = g.textArea.value.split('\n');
    for (let i = 0; i < g.lines.length; i++) {
        let l = g.lines[i].split('~');
        if (l.length > 1) {
            g.breakpoints.push(i);
            l = l[1];
        }
        l = g.lines[i].split(':');
        if (l.length > 1) {
            // improper symbol handling
            if (!g.sym.hasOwnProperty(l[0])) {
                g.sym[l[0]] = i;
            }
            else {
                g.error = `ERROR: symbol ${l[0]} occurs more than once.`;
                return;
            }
        }
    }
}

function secondPass() {
    let final = [];
    for (let i = 0; i < g.lines.length; i++) {
        let l = g.lines[i];
        if (l[0] === '~') {
            l = l.substr(1);
        }
        // removes symbols from beginning of lines
        let foo = l.split(':');
        l = foo[foo.length-1];
        //removes comments
        foo = l.split('#');
        l = foo[0].trim();
        // replaces commas with spaces
        l = l.replace(/,/g, ' ');
        // handles multiple spaces
        l = l.replace(/\s{2,}/g, ' ');
        // replaces ( and ) in lw/sw (naive)
        l = l.replace(/([(])/g, ' ');
        l = l.replace(/([)])/g, '');
        let larr = l.split(' ');
        // raises error if symbol is undefined
        if (['j','jal','bne','beq'].includes(larr[0])) {
            if (!g.sym.hasOwnProperty(larr[larr.length-1])) {
                g.error = `ERROR: undefined symbol ${larr[larr.length-1]}.`;
                return;
            }
        }
        // syntax handling + turns string immediates to integers
        let error = null;
        if (['add','sub','slt','and','or'].includes(larr[0])) {
            if (!g.reg.hasOwnProperty(larr[1]) || !g.reg.hasOwnProperty(larr[2]) || !g.reg.hasOwnProperty(larr[3]) || larr.length !== 4) {
                error = i;
            }
        } else if (['addi','slti','ori','andi','sll','srl','sra'].includes(larr[0]) && larr.length === 4) {
            larr[3] = Number(larr[3]);
            if (!g.reg.hasOwnProperty(larr[1]) || !g.reg.hasOwnProperty(larr[2]) || isNaN(larr[3])){
                error = i;
            }
        } else if (['bne','beq'].includes(larr[0]) && larr.length === 4){
            if (!g.reg.hasOwnProperty(larr[1]) || !g.reg.hasOwnProperty(larr[2])){
                error = i;
            }
        } else if (['lw','sw'].includes(larr[0]) && larr.length === 4) {
            larr[2] = Number(larr[2]);
            if (!g.reg.hasOwnProperty(larr[1]) || isNaN(larr[2]) || !g.reg.hasOwnProperty(larr[3])) {
                error = i;
            }
        } else if (['mult','div'].includes(larr[0]) && larr.length === 3) {
            if (!g.reg.hasOwnProperty(larr[1]) || !g.reg.hasOwnProperty(larr[2])) {
                error = i;
            }
        } else if (larr[0] === 'li' && larr.length === 3) {
            if (!g.reg.hasOwnProperty(larr[1]) || isNaN(larr[2])) {
                error = i;
            }
        } else if (['mflo','mfhi'].includes(larr[0]) && larr.length === 2) {
            if (!g.reg.hasOwnProperty(larr[1])) {
                error = i;
            }
        } else if (['jal','j'].includes(larr[0]) && larr.length === 2) {
            //no check necessary
        } else if (larr[0] === 'jr' && larr.length === 2) {
            if (!g.reg.hasOwnProperty(larr[1])) {
                error = i;
            }
        } else if (larr.length > 0 && larr[0] !== ''){
            error = i;
        }
        if (error !== null){
            g.error = `ERROR: syntax error at line ${error}.`;
            return;
        }
        final.push(larr);
    }
    g.lines = final;
}

function assemble() {
    firstPass();
    if (g.error === null) {
        secondPass();
    }
}






/*code-running functions*/

function step() {
    let l = g.lines[g.reg.pc];
    if (l === undefined) {
        g.error = "ERROR: cannot step further.";
        return;
    }
    let oldpc = g.reg.pc;
    g.reg.pc += g.increment;
    let rs;
    let rt;
    const opcode = l[0];
    const rd = l[1];
    if (l.length >= 3) {
        rs = l[2];
    } if (l.length === 4) {
        rt = l[3];
    }
    // R-format
    if (opcode === 'add'){
        g.reg[rd] = g.reg[rs] + g.reg[rt];
    } else if (opcode === 'sub'){
        g.reg[rd] = g.reg[rs] - g.reg[rt];       
    } else if (opcode === 'slt'){
        if (g.reg[rs] < g.reg[rt]){
            g.reg[rd] = 1;
        } else {
            g.reg[rd] = 0;
        }
    } else if (opcode === 'div') {
        g.reg.lo = Math.floor(g.reg[rd]/g.reg[rs]);
        g.reg.hi = g.reg[rd] % g.reg[rs];
    } else if (opcode === 'mult') {
        g.reg.lo = g.reg[rd] * g.reg[rs];
    } else if (opcode === 'and') {
        g.reg[rd] = g.reg[rs] & g.reg[rt];
    } else if (opcode === 'or') {
        g.reg[rd] = g.reg[rs] | g.reg[rt];
    } else if (opcode === 'mflo') {
        g.reg[rd] = g.reg.lo;
    } else if (opcode === 'mfhi') {
        g.reg[rd] = g.reg.hi;
    } else if (opcode === 'jr') {
        g.reg.pc = g.reg[rd]+g.increment;
    

    // I-format
    } else if (opcode === 'addi'){ 
        g.reg[rd] = g.reg[rs] + rt;
    } else if (opcode === 'slti'){
        if (g.reg[rs] < rt){
            g.reg[rd] = 1;
        } else {
            g.reg[rd] = 0;
        }
    } else if (opcode === 'andi') {
        g.reg[rd] = g.reg[rs] & rt;
    } else if (opcode === 'ori') {
        g.reg[rd] = g.reg[rs] | rt;
    } else if (opcode === 'sll') {  
        g.reg[rd] = g.reg[rs] << rt;
    } else if (opcode === 'srl') {
        g.reg[rd] = g.reg[rs] >>> rt;
    } else if (opcode === 'sra') {
        g.reg[rd] = g.reg[rs] >> rt;
    } else if (opcode === 'sw') {
        g.mem[rt + rs] = g.reg[rd];
    } else if (opcode === 'lw') {
        if (!g.mem.hasOwnProperty(rt + rs)){
            g.mem[rt + rs] = 0;
            g.reg[rd] = 0;
        } else {
            g.reg[rd] = g.mem[rt + rs];
        }
    } else if (opcode === 'li') {
        g.reg[rd] = Number(rs);
    } else if (opcode === 'beq'){
        if (g.reg[rs] === g.reg[rd]) {
            g.reg.pc = g.sym[rt];
        }
    } else if (opcode === 'bne'){
        if (g.reg[rs] !== g.reg[rd]) {
            g.reg.pc = g.sym[rt];
        }

    // J-format
    } else if (opcode === 'j'){
        g.reg.pc = g.sym[rd];
    } else if (opcode === 'jal'){
        g.reg.pc = g.sym[rd];
        g.reg.$ra = oldpc;
    }
}


function looper(i=0){
    if (i === 0) {g.breakpoints.push(g.lines.length);}
    if (g.running && i < g.maxInstructions && !g.breakpoints.includes(g.reg.pc)){
        step();
        setTimeout(looper, g.instructionDelay, i);
        if (i === g.maxInstructions) {
            g.error = 'ERROR: instruction limit reached (possible infinite loop).';
        }
        if (g.instructionDelay > g.displayAbove) {
            refresh();
        }
        i++;
    } else {
        //executes at the last time
        g.breakpoints.splice(g.breakpoints.indexOf(g.reg.pc), 1);
        refresh();
        pauseButton();
    }
}











/*primarily page-changing functions*/

function visualizeRegisters() {
    g.table.innerHTML = '';
    let i = 0;
    for (const key in g.reg) {
        if (i < Object.keys(g.reg).length && g.reg[key] !== 0) {
            let str = key + ': ' + g.reg[key];
            let row = document.createElement('tr');
            g.table.appendChild(row);
            let cell = document.createElement('td');
            cell.classList.add('regbox');
            cell.id = key;
            row.appendChild(cell);
            cell.innerText = str;
        } 
        i++;
    }
}

function visualizeInstructions() {
    g.output.innerHTML = '';
    let bottom;
    let top;
    if (g.reg.pc-(g.toDisplay/2) > 0) {
        bottom = g.reg.pc-(g.toDisplay/2);
    } else {
        bottom = 0;
    }
    if (bottom+g.toDisplay < g.lines.length) {
        top = bottom+g.toDisplay;
    } else {
        top = g.lines.length;
    }
    i = bottom;
    while (i < top) {
        let l = document.createElement('p');
        l.innerText = i + ':  ' + g.code[i];
        l.classList.add('instruction');
        if (i === g.reg.pc) {
            l.id = 'currentLine';
        }
        g.output.appendChild(l);
        i++;
    }
}

function fillError() {
    //when g.error is empty, clears error
    g.errorText.innerText = g.error;
}

function refresh() {
    visualizeInstructions();
    visualizeRegisters();
    fillError();
}

/*button functions*/

function ulamButton() {
    g.textArea.value = ULAM;
}

function stepButton() {
    step();
    refresh();
}

function pauseButton() {
    g.running = false;
    g.bStep.removeAttribute('disabled');
    g.bAssemble.removeAttribute('disabled');
    g.slider.removeAttribute('disabled');
    g.bRun.innerText = 'RUN';
}

function runButton() {
    if (g.bRun.innerText === 'RUN') {
        fillError();
        g.running = true;
        g.bRun.innerText = 'PAUSE';
        g.bStep.setAttribute('disabled','true');
        g.bAssemble.setAttribute('disabled','true');
        g.slider.setAttribute('disabled', 'true');
        looper();
    } else {
        pauseButton();
    }
}

function assembleButton() {
    assemble();
    fillError();
    if (g.bAssemble.innerText === 'ASSEMBLE' && g.error === null) {
        g.textArea.setAttribute('disabled','true');
        g.bRun.removeAttribute('disabled');
        g.bStep.removeAttribute('disabled');
        g.bUlam.setAttribute('disabled','true');
        visualizeInstructions();
        g.bAssemble.innerText = 'DISASSEMBLE';
    } else if (g.bAssemble.innerText === 'DISASSEMBLE') {
        g.textArea.removeAttribute('disabled');
        g.bRun.setAttribute('disabled','true');
        g.bStep.setAttribute('disabled','true');
        g.bUlam.removeAttribute('disabled');
        g.bAssemble.innerText = 'ASSEMBLE';
        g.output.innerHTML = '';
        g.error = null;
        initRegisters();
        visualizeRegisters();
        fillError();
        g.breakpoints = [];
    }
    g.error = null;
}