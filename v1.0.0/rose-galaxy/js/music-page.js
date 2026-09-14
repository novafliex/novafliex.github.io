(function () {
  "use strict";

  if (window.__novaMusicBootstrap) {
    window.__novaMusicBootstrap.init();
    return;
  }

  const visualImages = [
    "/img/music1.webp",
    "/img/music2.webp",
    "/img/music3.webp",
    "/img/music4.webp",
    "/img/music5.webp",
  ];
  const visibleOffsets = [-2, -1, 0, 1, 2];
  const loadedVisualImages = new Set();
  const pendingVisualImages = new Map();

  function previewImage(image) {
    return image.replace(/\.webp$/i, "-preview.webp");
  }

  function preloadVisualImage(image) {
    if (loadedVisualImages.has(image)) return Promise.resolve(image);
    if (pendingVisualImages.has(image)) return pendingVisualImages.get(image);

    const request = new Promise((resolve, reject) => {
      const loader = new Image();
      loader.decoding = "async";
      loader.onload = async () => {
        try {
          await loader.decode?.();
        } catch (_) {
          // The decoded image is still usable when decode() is unsupported or interrupted.
        }
        loadedVisualImages.add(image);
        pendingVisualImages.delete(image);
        resolve(image);
      };
      loader.onerror = () => {
        pendingVisualImages.delete(image);
        reject(new Error(`Nova music: failed to preload ${image}`));
      };
      loader.src = image;
    });

    pendingVisualImages.set(image, request);
    return request;
  }

  function assignCardImage(image, source, isCurrent, shouldPreload) {
    const currentSource = image.getAttribute("src") || "";
    image.dataset.src = source;
    image.width = 640;
    image.height = 960;
    image.decoding = "async";

    if (currentSource === source) {
      image.loading = isCurrent ? "eager" : "lazy";
      if (!isCurrent) image.removeAttribute("fetchpriority");
      if (image.complete && image.naturalWidth) loadedVisualImages.add(source);
      else image.addEventListener("load", () => loadedVisualImages.add(source), { once: true });
      return;
    }

    image.loading = isCurrent ? "eager" : "lazy";
    image.removeAttribute("fetchpriority");
    image.src = loadedVisualImages.has(source) ? source : previewImage(source);

    if (!isCurrent && !shouldPreload) return;
    preloadVisualImage(source)
      .then(loadedSource => {
        if (image.dataset.src === loadedSource) image.src = loadedSource;
      })
      .catch(error => console.warn(error.message));
  }

  function warmCardImage(image) {
    const source = image?.dataset.src;
    if (!source || loadedVisualImages.has(source)) return;
    preloadVisualImage(source)
      .then(loadedSource => {
        if (image.dataset.src === loadedSource) image.src = loadedSource;
      })
      .catch(error => console.warn(error.message));
  }

  function normalizeIndex(index, length) {
    return length ? ((index % length) + length) % length : 0;
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
    const minutes = Math.floor(seconds / 60);
    const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${rest}`;
  }

  function createMusicPageController(root) {
    const state = {
      root,
      aplayer: null,
      audio: null,
      songs: [],
      currentIndex: 0,
      listeners: [],
      timer: 0,
      destroyed: false,
    };

    const els = {
      meting: root.querySelector(".nova-music-meting-bridge meting-js"),
      title: root.querySelector(".nova-music-current-title"),
      artist: root.querySelector(".nova-music-current-artist"),
      cover: root.querySelector(".nova-music-current-cover"),
      progress: root.querySelector(".nova-music-progress-input"),
      currentTime: root.querySelector(".nova-music-current-time"),
      duration: root.querySelector(".nova-music-duration"),
      toggle: root.querySelector(".nova-music-toggle"),
      previous: root.querySelector(".nova-music-previous"),
      next: root.querySelector(".nova-music-next"),
      count: root.querySelector(".nova-music-count"),
      notesCount: root.querySelector(".nova-music-notes-count"),
      retry: root.querySelector(".nova-music-retry"),
      cards: [...root.querySelectorAll(".nova-music-card")],
    };

    const on = (target, type, handler, options) => {
      target?.addEventListener(type, handler, options);
      if (target) state.listeners.push(() => target.removeEventListener(type, handler, options));
    };

    const songName = song => song?.name || song?.title || "未命名歌曲";
    const songArtist = song => song?.artist || song?.author || "未知歌手";
    const songCover = (song, index) => song?.cover || song?.pic || visualImages[normalizeIndex(index, visualImages.length)];

    function showLoadingState() {
      window.clearTimeout(state.timer);
      els.title.textContent = "歌单载入中";
      els.artist.textContent = "网易云音乐";
      if (els.retry) els.retry.hidden = true;
    }

    function showLoadFailure(title, detail) {
      els.title.textContent = title;
      els.artist.textContent = detail;
      if (els.retry) els.retry.hidden = false;
    }

    function renderCurrentSong() {
      const song = state.songs[state.currentIndex];
      if (!song) return;
      const name = songName(song);
      const artist = songArtist(song);
      els.title.textContent = name;
      els.artist.textContent = artist;
      const cover = songCover(song, state.currentIndex);
      const hasSquarePlaylistCover = Boolean(song?.cover || song?.pic);
      els.cover.src = cover;
      els.cover.width = 640;
      els.cover.height = hasSquarePlaylistCover ? 640 : 960;
      els.cover.alt = `${name} - ${artist}`;
      els.count.textContent = `共 ${state.songs.length} 首 · 当前第 ${state.currentIndex + 1} 首`;
      if (els.notesCount) els.notesCount.textContent = `${state.songs.length} TRACKS`;
      state.root.classList.toggle("is-playing", Boolean(state.audio && !state.audio.paused));
      els.toggle.textContent = state.audio && !state.audio.paused ? "Ⅱ" : "▶";
      els.toggle.setAttribute("aria-label", state.audio && !state.audio.paused ? "暂停" : "播放");
    }

    function renderVisibleCards() {
      const total = state.songs.length;
      els.cards.forEach((card, slot) => {
        const index = normalizeIndex(state.currentIndex + visibleOffsets[slot], total);
        const song = state.songs[index];
        const name = songName(song);
        const artist = songArtist(song);
        const image = visualImages[normalizeIndex(index, visualImages.length)];
        card.dataset.songIndex = String(index);
        card.setAttribute("aria-label", slot === 2 ? `${name}，播放或暂停` : `播放 ${name} - ${artist}`);
        card.toggleAttribute("aria-current", slot === 2);
        const img = card.querySelector("img");
        assignCardImage(img, image, slot === 2, slot === 3);
        img.alt = `${name} - ${artist}`;
        card.querySelector("strong").textContent = slot === 2 ? name : "";
        card.querySelector("small").textContent = slot === 2 ? artist : "";
      });
    }

    function updateProgress() {
      const current = Number.isFinite(state.audio?.currentTime) ? state.audio.currentTime : 0;
      const duration = Number.isFinite(state.audio?.duration) ? state.audio.duration : 0;
      els.currentTime.textContent = formatTime(current);
      els.duration.textContent = formatTime(duration);
      const value = duration > 0 ? Math.round((current / duration) * 1000) : 0;
      els.progress.value = String(value);
      els.progress.style.setProperty("--nova-music-progress", `${value / 10}%`);
    }

    function syncIndexFromPlayer() {
      const nextIndex = Number.isInteger(state.aplayer?.list?.index) ? state.aplayer.list.index : state.currentIndex;
      state.currentIndex = normalizeIndex(nextIndex, state.songs.length);
      renderCurrentSong();
      renderVisibleCards();
      updateProgress();
    }

    function playSongAt(index) {
      if (!state.songs.length || !state.aplayer) return;
      state.currentIndex = normalizeIndex(index, state.songs.length);
      state.aplayer.list.switch(state.currentIndex);
      renderCurrentSong();
      renderVisibleCards();
      updateProgress();
      const playResult = state.aplayer.play();
      if (playResult?.catch) {
        playResult.catch(error => console.warn("Nova music: playback was blocked.", error));
      }
    }

    function playNext() {
      playSongAt(state.currentIndex + 1);
    }

    function playPrevious() {
      playSongAt(state.currentIndex - 1);
    }

    function togglePlayback() {
      if (!state.audio || !state.aplayer) return;
      if (state.audio.paused) {
        const result = state.aplayer.play();
        if (result?.catch) result.catch(error => console.warn("Nova music: playback failed.", error));
      } else {
        state.aplayer.pause();
      }
    }

    function seekTo(percent) {
      const duration = Number.isFinite(state.audio?.duration) ? state.audio.duration : 0;
      if (!duration) return;
      const target = Math.max(0, Math.min(1, percent)) * duration;
      if (typeof state.aplayer.seek === "function") state.aplayer.seek(target);
      else state.audio.currentTime = target;
    }

    function bindMusicControls() {
      on(els.previous, "click", playPrevious);
      on(els.next, "click", playNext);
      on(els.toggle, "click", togglePlayback);
      on(els.progress, "input", event => seekTo(Number(event.target.value) / 1000));
      els.cards.forEach((card, slot) => {
        const warm = () => warmCardImage(card.querySelector("img"));
        on(card, "pointerenter", warm);
        on(card, "focusin", warm);
        on(card, "click", () => {
          if (slot === 2) togglePlayback();
          else playSongAt(Number(card.dataset.songIndex));
        });
      });
      on(document, "keydown", event => {
        if (!state.root.isConnected || event.target?.matches("input, textarea, [contenteditable]")) return;
        if (event.key === "ArrowLeft") playPrevious();
        if (event.key === "ArrowRight") playNext();
      });
    }

    function bindPlayerEvents() {
      on(state.audio, "play", renderCurrentSong);
      on(state.audio, "pause", renderCurrentSong);
      on(state.audio, "timeupdate", updateProgress);
      on(state.audio, "durationchange", updateProgress);
      on(state.audio, "loadedmetadata", updateProgress);
      on(state.audio, "ended", playNext);
      on(state.audio, "error", () => {
        els.title.textContent = "当前歌曲暂时无法播放";
        els.artist.textContent = "请尝试切换下一首";
        console.error("Nova music: APlayer audio source failed.", state.songs[state.currentIndex]);
      });
      on(state.audio, "loadstart", () => window.setTimeout(syncIndexFromPlayer, 0));
    }

    function attachAPlayer(aplayer) {
      if (state.destroyed) return;
      state.aplayer = aplayer;
      state.audio = aplayer.audio;
      state.songs = Array.isArray(aplayer.list?.audios) ? aplayer.list.audios : [];
      if (!state.songs.length) {
        showLoadFailure("歌单暂时为空", "请稍后重新载入");
        console.error("Nova music: the existing Meting playlist returned no songs.");
        return;
      }
      if (els.retry) els.retry.hidden = true;
      state.currentIndex = normalizeIndex(aplayer.list.index || 0, state.songs.length);
      bindMusicControls();
      bindPlayerEvents();
      renderCurrentSong();
      renderVisibleCards();
      updateProgress();
    }

    function loadPlaylist() {
      showLoadingState();
      let attempts = 0;
      const findPlayer = () => {
        if (state.destroyed) return;
        // MetingJS releases expose the same APlayer instance under either
        // `ap` or `aplayer`; support both without constructing another player.
        const aplayer = els.meting?.aplayer || els.meting?.ap;
        if (aplayer?.audio && Array.isArray(aplayer.list?.audios)) {
          attachAPlayer(aplayer);
          return;
        }
        attempts += 1;
        if (attempts >= 100) {
          showLoadFailure("网易云歌单加载失败", "请检查网络后重新载入");
          console.error("Nova music: timed out waiting for the existing Meting/APlayer instance.");
          return;
        }
        state.timer = window.setTimeout(findPlayer, 100);
      };
      findPlayer();
    }

    function destroyMusicPage() {
      state.destroyed = true;
      window.clearTimeout(state.timer);
      state.listeners.splice(0).forEach(remove => remove());
    }

    on(els.retry, "click", loadPlaylist);
    loadPlaylist();
    return { root, destroy: destroyMusicPage };
  }

  function initMusicPage() {
    const root = document.querySelector(".nova-music-page");
    if (!root) return;
    if (window.__novaMusicController?.root === root) return;
    window.__novaMusicController?.destroy();
    window.__novaMusicController = createMusicPageController(root);
  }

  function leaveMusicPage() {
    window.__novaMusicController?.destroy();
    window.__novaMusicController = null;
  }

  window.__novaMusicBootstrap = {
    init: initMusicPage,
    destroy: leaveMusicPage,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMusicPage, { once: true });
  } else {
    initMusicPage();
  }
  document.addEventListener("pjax:send", leaveMusicPage);
  document.addEventListener("pjax:complete", initMusicPage);
})();
