(() => {
// Shared UI event wiring helpers.
function wireNoteButtonOnce(button, nowFn, onManualClick){
  if (!button) return;
  if (button._wiredFastTap) return;
  button._wiredFastTap = true;

  let lastFast = 0;
  let pressTimer = 0;

  const clearPressed = () => {
    if (pressTimer){
      clearTimeout(pressTimer);
      pressTimer = 0;
    }
    button.classList.remove("is-pressed");
  };

  const pulsePressed = (holdMs = 110) => {
    button.classList.add("is-pressed");
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      button.classList.remove("is-pressed");
      pressTimer = 0;
    }, holdMs);
  };

  const doClick = () => {
    onManualClick();
  };

  button.addEventListener("pointerdown", (e) => {
    button.classList.add("is-pressed");

    if (e.pointerType === "mouse") return;

    e.preventDefault();
    lastFast = nowFn();
    doClick();
    pulsePressed(90);
  }, { passive: false });

  button.addEventListener("pointerup", (e) => {
    if (e.pointerType !== "mouse") return;
    lastFast = nowFn();
    doClick();
    pulsePressed(70);
  });

  button.addEventListener("pointercancel", clearPressed);
  button.addEventListener("mouseleave", clearPressed);
  button.addEventListener("touchcancel", clearPressed);

  button.addEventListener("click", () => {
    if (nowFn() - lastFast < 650) return;
    pulsePressed(70);
    doClick();
  });
}

window.ScoreUIEvents = {
  wireNoteButtonOnce
};
})();
