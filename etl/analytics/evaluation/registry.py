"""Registry of Evaluable implementations."""

from __future__ import annotations

from .base import Evaluable

_REGISTRY: dict[str, type[Evaluable]] = {}


def register(cls: type[Evaluable]) -> type[Evaluable]:
    """Register an Evaluable subclass. Returns the class so it can be used as a decorator."""
    if not issubclass(cls, Evaluable):
        raise TypeError(f"{cls.__name__} is not an Evaluable subclass")
    if not hasattr(cls, "name") or not cls.name:
        raise ValueError(f"{cls.__name__} must set a non-empty class attribute `name`")
    _REGISTRY[cls.name] = cls
    return cls


def get(name: str) -> type[Evaluable]:
    if name not in _REGISTRY:
        raise KeyError(f"Model '{name}' is not registered. Known: {list_models()}")
    return _REGISTRY[name]


def list_models() -> list[str]:
    return sorted(_REGISTRY.keys())
