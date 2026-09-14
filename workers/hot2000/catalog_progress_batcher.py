"""Rate-limited progress/checkpoint uploads for conservative Cloudflare usage."""

from __future__ import annotations

import time
from typing import Any, Callable


class ProgressBatcher:
    """Batch compact worker progress uploads (default 4s) and checkpoints (default 30s)."""

    def __init__(
        self,
        *,
        progress_interval_s: float = 4.0,
        checkpoint_interval_s: float = 30.0,
    ) -> None:
        self.progress_interval_s = progress_interval_s
        self.checkpoint_interval_s = checkpoint_interval_s
        self._last_progress = -progress_interval_s
        self._last_checkpoint = -checkpoint_interval_s
        self._pending_progress: tuple[Any, ...] | None = None
        self._pending_checkpoint: tuple[Any, ...] | None = None

    def maybe_progress(self, fn: Callable[..., None], *args: Any, **kwargs: Any) -> bool:
        self._pending_progress = (fn, args, kwargs)
        now = time.monotonic()
        if now - self._last_progress < self.progress_interval_s:
            return False
        fn(*args, **kwargs)
        self._last_progress = now
        self._pending_progress = None
        return True

    def flush_progress(self) -> None:
        if not self._pending_progress:
            return
        fn, args, kwargs = self._pending_progress
        fn(*args, **kwargs)
        self._last_progress = time.monotonic()
        self._pending_progress = None

    def maybe_checkpoint(self, fn: Callable[..., None], *args: Any, **kwargs: Any) -> bool:
        self._pending_checkpoint = (fn, args, kwargs)
        now = time.monotonic()
        if now - self._last_checkpoint < self.checkpoint_interval_s:
            return False
        fn(*args, **kwargs)
        self._last_checkpoint = now
        self._pending_checkpoint = None
        return True

    def flush_checkpoint(self) -> None:
        if not self._pending_checkpoint:
            return
        fn, args, kwargs = self._pending_checkpoint
        fn(*args, **kwargs)
        self._last_checkpoint = time.monotonic()
        self._pending_checkpoint = None

    def flush_all(self) -> None:
        self.flush_progress()
        self.flush_checkpoint()
