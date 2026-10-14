/**
 * El botón «Reintentar» da feedback mientras reintenta.
 *
 * TanStack mantiene `isError` en true durante un `refetch()`, así que sin esto
 * el botón parecía no hacer nada y, si volvía a fallar, el visitante no veía
 * que algo había pasado.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ErrorDeCarga } from '@/components/ErrorDeCarga';

describe('ErrorDeCarga', () => {
  it('por defecto ofrece «Reintentar» y lo llama', () => {
    const onReintentar = vi.fn();
    render(<ErrorDeCarga titulo="No pudimos cargar X" error={null} onReintentar={onReintentar} />);

    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(onReintentar).toHaveBeenCalledTimes(1);
  });

  it('mientras reintenta: botón deshabilitado y «Reintentando…»', () => {
    const onReintentar = vi.fn();
    render(
      <ErrorDeCarga titulo="No pudimos cargar X" error={null} onReintentar={onReintentar} reintentando />,
    );

    const boton = screen.getByRole('button', { name: /reintentando/i });
    expect(boton).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^reintentar$/i })).not.toBeInTheDocument();
    fireEvent.click(boton);
    expect(onReintentar).not.toHaveBeenCalled();
  });
});
