(function () {
  "use strict";

  const cfg = window.SPIKE_REDUCER_CONFIG || {};
  const GREETING =
    cfg.greeting || "Tell me about your next meal.";
  const POLICY_REJECTION =
    cfg.policyRejection ||
    "I am not allowed to discuss anything apart from food.";

  const openBtn = document.getElementById("spikeReducerOpenBtn");
  const modal = document.getElementById("spikeReducerModal");
  const backdrop = document.getElementById("spikeReducerBackdrop");
  const closeBtn = document.getElementById("spikeReducerCloseBtn");
  const statusEl = document.getElementById("srStatus");
  const greetingEl = document.getElementById("srGreeting");
  const textInput = document.getElementById("srTextInput");
  const listenBtn = document.getElementById("srListenBtn");
  const sendBtn = document.getElementById("srSendBtn");
  const stopBtn = document.getElementById("srStopBtn");
  const transcriptEl = document.getElementById("srTranscript");
  const responseEl = document.getElementById("srResponse");

  if (!openBtn || !modal) return;

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let history = [];
  let busy = false;

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function setGreeting(text) {
    if (greetingEl) greetingEl.textContent = text;
  }

  function showModal() {
    modal.hidden = false;
    if (backdrop) backdrop.hidden = false;
    document.body.style.overflow = "hidden";
    openBtn.setAttribute("aria-expanded", "true");
  }

  function hideModal() {
    stopAll();
    modal.hidden = true;
    if (backdrop) backdrop.hidden = true;
    document.body.style.overflow = "";
    openBtn.setAttribute("aria-expanded", "false");
  }

  function stopAll() {
    window.speechSynthesis.cancel();
    if (recognition) {
      try {
        recognition.abort();
      } catch (_) {}
    }
    busy = false;
  }

  function pickFemaleEnglishVoice() {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;

    const english = voices.filter(function (v) {
      return v.lang && v.lang.toLowerCase().indexOf("en") === 0;
    });
    const usEnglish = english.filter(function (v) {
      return v.lang.toLowerCase().indexOf("en-us") === 0;
    });
    const pool = usEnglish.length ? usEnglish : english;

    const femaleHint =
      /female|zira|samantha|victoria|karen|susan|aria|jenny|linda|heather|michelle|natasha|emma|sonia|hazel|laura|sara|nancy|allison|joanna|kendra|kimberly|ivy|lisa|monica|paulina|fiona|moira|tessa|veena|ava|jenna|stephanie|olivia|salli|amy|nicole|kate|catherine|anna|alice/i;
    const maleHint =
      /male|\bdavid\b|\bmark\b|\bjames\b|\bgeorge\b|\bguy\b|\bdaniel\b|\bryan\b|\brichard\b|\bthomas\b|\bbrian\b|\bchristopher\b|\bmatthew\b|\bsteven\b/i;

    const female = pool.find(function (v) {
      const name = v.name.toLowerCase();
      if (maleHint.test(name)) return false;
      return femaleHint.test(name);
    });
    if (female) return female;

    const notMale = pool.find(function (v) {
      return !maleHint.test(v.name.toLowerCase());
    });
    return notMale || pool[0] || null;
  }

  function speak(text, onEnd) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 1;
    const voice = pickFemaleEnglishVoice();
    if (voice) u.voice = voice;
    if (onEnd) {
      u.onend = onEnd;
      u.onerror = onEnd;
    }
    window.speechSynthesis.speak(u);
  }

  function speakReply(text) {
    const short =
      text.length > 500 ? text.slice(0, 480).replace(/\s+\S*$/, "") + "…" : text;
    speak(short);
  }

  function initRecognition() {
    if (!SpeechRecognition) return null;
    const r = new SpeechRecognition();
    r.lang = "en-US";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.continuous = false;
    return r;
  }

  function startListening() {
    if (!SpeechRecognition) {
      setStatus("Voice not supported here — type your meal and press Send.");
      if (textInput) textInput.focus();
      return;
    }
    if (busy) return;
    stopAll();
    recognition = initRecognition();
    setStatus("Listening… describe your next meal.");
    recognition.onresult = function (ev) {
      const text = ev.results[0][0].transcript.trim();
      if (textInput) textInput.value = text;
      if (transcriptEl) transcriptEl.textContent = "You said: " + text;
      setStatus("Got it — asking Spike Reducer…");
      submitMessage(text);
    };
    recognition.onerror = function (ev) {
      setStatus(
        "Could not hear you (" + (ev.error || "error") + "). Try again or type instead."
      );
      busy = false;
    };
    recognition.onend = function () {
      if (!busy) setStatus("Tap Speak or Send when ready.");
    };
    busy = true;
    recognition.start();
  }

  async function submitMessage(message) {
    const apiUrl = (cfg.apiUrl || "").trim();
    if (!apiUrl) {
      setStatus("Setup needed");
      if (responseEl) {
        responseEl.textContent =
          "Spike Reducer is not connected yet. See README-spike-reducer.md, then set apiUrl in js/spike-reducer-config.js.";
      }
      busy = false;
      return;
    }

    if (!message) {
      setStatus("Please describe your meal first.");
      busy = false;
      return;
    }

    stopAll();
    busy = true;
    setStatus("Thinking…");
    if (responseEl) responseEl.textContent = "";

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message, history: history }),
      });
      const data = await res.json().catch(function () {
        return {};
      });

      if (!res.ok) {
        throw new Error(data.message || data.error || "Request failed");
      }

      const reply = data.reply || "";
      history.push({ role: "user", text: message });
      history.push({ role: "assistant", text: reply });
      if (history.length > 8) history = history.slice(-8);

      if (responseEl) responseEl.textContent = reply;
      if (reply === POLICY_REJECTION || data.policy === "rejected") {
        setStatus("Food topics only.");
      } else {
        setStatus("Here are protein & fat ideas for a steadier meal.");
      }
      speakReply(reply);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setStatus("Error");
      if (responseEl) {
        responseEl.textContent =
          "Could not reach Spike Reducer. Please try again in a moment.\n\n" +
          msg;
      }
    } finally {
      busy = false;
    }
  }

  function onOpen() {
    showModal();
    history = [];
    if (transcriptEl) transcriptEl.textContent = "";
    if (responseEl) responseEl.textContent = "";
    if (textInput) textInput.value = "";
    setGreeting(GREETING);
    setStatus("Speaking…");
    speak(GREETING, function () {
      setStatus("Listening… or type your meal, then Send.");
      if (SpeechRecognition) startListening();
      else if (textInput) textInput.focus();
    });
  }

  openBtn.addEventListener("click", function (e) {
    e.preventDefault();
    onOpen();
  });

  if (closeBtn) closeBtn.addEventListener("click", hideModal);
  if (backdrop) backdrop.addEventListener("click", hideModal);

  if (listenBtn) {
    listenBtn.addEventListener("click", function () {
      if (!busy) startListening();
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener("click", function () {
      const text = textInput ? textInput.value.trim() : "";
      if (transcriptEl && text) transcriptEl.textContent = "You said: " + text;
      submitMessage(text);
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", function () {
      stopAll();
      setStatus("Stopped. Tap Speak or Send to continue.");
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal && !modal.hidden) hideModal();
  });

  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener("voiceschanged", function () {
      window.speechSynthesis.getVoices();
    });
  }
})();
