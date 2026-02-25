(() => {
// Shared UI event wiring helpers.
function wireNoteButtonOnce(button, nowFn, onManualClick){
  if (!button) return;
  if (button._wiredFastTap) return;
  button._wiredFastTap = true;

  let lastFast = 0;

  const doClick = () => {
    onManualClick();
  };

  const fastTap = (e) => {
    e.preventDefault();
    lastFast = nowFn();
    doClick();
  };

  button.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    fastTap(e);
  }, { passive: false });

  button.addEventListener("touchstart", fastTap, { passive: false });

  button.addEventListener("click", () => {
    if (nowFn() - lastFast < 650) return;
    doClick();
  });
}

window.ScoreUIEvents = {
  wireNoteButtonOnce
};
})();
