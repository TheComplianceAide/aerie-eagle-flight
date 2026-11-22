// Feed normalized demands to the same aerodynamic controls as the keyboard.
window.makeFlightPointer = function ({surface, cue, currentStage, pick, pan, call, land}) {
  const input = {x:0, y:0};
  let contact = null, chord = null;
  let awaitingMouseMotion = true;
  let firstMouseX, firstMouseY;
  function neutral() {
    input.x = input.y = 0;
    cue.hidden = true;
  }
  function clear() {
    const ids = [contact?.id, chord?.id];
    contact = chord = null;
    awaitingMouseMotion = true;
    firstMouseX = firstMouseY = undefined;
    for(const id of ids)if (id != null && surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
    neutral();
  }
  function axis(value, dead) {
    const amount = Math.min(1, Math.max(0, (Math.abs(value)-dead)/(1-dead)));
    return Math.sign(value)*amount**1.22;
  }
  function steer(dx, dy, rx, ry, dead) {
    input.x = axis(dx/rx,dead);
    input.y = axis(-dy/ry,dead);
  }
  function showCue(x,y,kind) {
    cue.dataset.kind = kind;
    cue.style.left = x+'px';
    cue.style.top = y+'px';
    cue.hidden = false;
  }
  function still(point,e) {
    return Math.hypot(e.clientX-point.x,e.clientY-point.y)<=7;
  }
  surface.addEventListener('contextmenu', e => {
    const stage=currentStage();
    if (!stage || e.button!==2 || (e.pointerType && e.pointerType!=='mouse')) return;
    e.preventDefault();
    if (stage==='free') land?.(e.clientX,e.clientY);
  });
  surface.addEventListener('pointerdown', e => {
    const stage=currentStage();
    if (!stage || e.button!==0) return;
    // Any additional finger before the pair finishes invalidates the call.
    if(e.pointerType==='touch' && chord){chord.valid=false;return;}
    if (!e.isPrimary) {
      if(e.pointerType==='touch' && contact?.type==='touch'){
        if(stage==='free' && !contact.moved && e.timeStamp-contact.time<280){
          chord={id:e.pointerId,x:e.clientX,y:e.clientY,time:contact.time,valid:true,primaryUp:false,secondaryUp:false};
          surface.setPointerCapture(e.pointerId);
          neutral();
        }
      }
      return;
    }
    if(contact || chord || (e.pointerType==='mouse' && (e.ctrlKey||e.metaKey)))return;
    contact={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false,type:e.pointerType,time:e.timeStamp};
    surface.setPointerCapture(e.pointerId);
    if (e.pointerType!=='mouse' && stage==='free') {
      neutral();
      showCue(e.clientX,e.clientY,'touch');
    }
  });
  surface.addEventListener('pointermove', e => {
    const stage=currentStage();
    if (!stage) return;
    if(chord && (contact?.id===e.pointerId || chord.id===e.pointerId)){
      const point=contact?.id===e.pointerId?contact:chord;
      if(!still(point,e))chord.valid=false;
      if(!e.isPrimary || chord.valid)return;
      // An invalid chord falls back to the primary finger's normal steering.
    }
    if (!e.isPrimary || (contact && contact.id!==e.pointerId)) return;
    if (contact) {
      const dx=e.clientX-contact.x, dy=e.clientY-contact.y;
      if (Math.hypot(dx,dy)>7) contact.moved=true;
      if (stage==='perched') pan((contact.lastX-e.clientX)*.006,(e.clientY-contact.lastY)*.006);
      contact.lastX=e.clientX; contact.lastY=e.clientY;
      if (stage==='free' && e.pointerType!=='mouse') {
        const travel=Math.max(42,Math.min(86,Math.min(surface.clientWidth,surface.clientHeight)*.16));
        steer(dx,dy,travel,travel,.08);
      }
    }
    if (stage==='free' && e.pointerType==='mouse') {
      // WebKit can retarget the stationary launch-button pointer to the canvas
      // as the menu disappears. Wait for movement before applying a flight input.
      if (awaitingMouseMotion) {
        const changedPosition = firstMouseX !== undefined &&
          (e.clientX !== firstMouseX || e.clientY !== firstMouseY);
        firstMouseX = e.clientX;
        firstMouseY = e.clientY;
        if (!e.movementX && !e.movementY && !changedPosition) return;
        awaitingMouseMotion = false;
      }
      const rect=surface.getBoundingClientRect(), cx=rect.width/2, cy=rect.height/2;
      steer(e.clientX-rect.left-cx,e.clientY-rect.top-cy,cx*.85,cy*.82,.065);
      showCue(rect.left+cx,rect.top+cy,'mouse');
    } else if (stage!=='free') neutral();
  });
  surface.addEventListener('pointerup', e => {
    if(chord && (contact?.id===e.pointerId || chord.id===e.pointerId)){
      const primary=contact?.id===e.pointerId, point=primary?contact:chord;
      if(!still(point,e) || e.timeStamp-chord.time>=280)chord.valid=false;
      if(primary){chord.primaryUp=true;contact=null;neutral();}
      else chord.secondaryUp=true;
      if(chord.primaryUp && chord.secondaryUp){
        const valid=chord.valid;chord=null;
        if(valid && currentStage()==='free')call?.();
      }
      return;
    }
    if (!contact || contact.id!==e.pointerId) return;
    const tapped=!contact.moved && still(contact,e), stage=currentStage();
    contact=null;
    if (e.pointerType!=='mouse') neutral();
    if(tapped && e.pointerType==='mouse' && !e.ctrlKey && !e.metaKey && (stage==='free'||stage==='perched'))call?.();
    else if(tapped && e.pointerType!=='mouse' && stage==='free')pick(e.clientX,e.clientY);
  });
  surface.addEventListener('pointercancel', e => {if (contact?.id===e.pointerId || (chord?.id===e.pointerId && !chord.secondaryUp)) clear();});
  surface.addEventListener('lostpointercapture', e => {if (contact?.id===e.pointerId || (chord?.id===e.pointerId && !chord.secondaryUp)) clear();});
  surface.addEventListener('pointerleave', e => {if (!contact && e.pointerType==='mouse') neutral();});
  window.addEventListener('resize', clear);
  return {input,clear};
};
