/**
 * El tooltip de los paneles de `/mercado` es accesible: se alcanza con el
 * teclado y su texto es la descripción del disparador. Con `display: none`
 * cerrado (para no ensanchar la página en móvil) esto es lo que evita que el
 * texto desaparezca para un lector de pantalla.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InfoTooltip } from '@/components/bi/InfoTooltip';

describe('InfoTooltip', () => {
  it('el disparador es enfocable y apunta al globo con aria-describedby', () => {
    render(
      <InfoTooltip content="Monto total anual adjudicado.">
        <span>Tendencias</span>
      </InfoTooltip>,
    );

    const disparador = screen.getByText('Tendencias').parentElement as HTMLElement;
    expect(disparador.tabIndex).toBe(0);

    const id = disparador.getAttribute('aria-describedby');
    expect(id, 'sin aria-describedby').toBeTruthy();

    const globo = document.getElementById(id as string) as HTMLElement;
    expect(globo.getAttribute('role')).toBe('tooltip');
    expect(globo.textContent).toBe('Monto total anual adjudicado.');
    // Dentro del disparador: que el foco y el hover (group-*) lo abran.
    expect(disparador.contains(globo)).toBe(true);
  });

  it('dos tooltips no comparten id', () => {
    render(
      <>
        <InfoTooltip content="Uno" />
        <InfoTooltip content="Dos" />
      </>,
    );
    const ids = screen.getAllByRole('tooltip', { hidden: true }).map((t) => t.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('sólo con el ícono: es un botón con nombre accesible y descripción', () => {
    render(<InfoTooltip content="Qué mide este número." />);
    const boton = screen.getByRole('button', { name: 'Más información' });
    expect(boton).toHaveAttribute('type', 'button');
    expect(boton.tabIndex).toBe(0);
    const globo = document.getElementById(boton.getAttribute('aria-describedby') as string);
    expect(globo).toHaveTextContent('Qué mide este número.');
  });

  it('con texto, el texto es el nombre: no se pisa con «Más información»', () => {
    render(
      <InfoTooltip content="Explicación">
        <span>Tendencias</span>
      </InfoTooltip>,
    );
    expect(screen.queryByRole('button', { name: 'Más información' })).toBeNull();
    const disparador = screen.getByText('Tendencias').parentElement as HTMLElement;
    expect(disparador).not.toHaveAttribute('aria-label');
  });

  it.each([
    ['con texto', true],
    ['sólo ícono', false],
  ])('Escape quita el foco y con él se cierra el globo (%s)', (_, conTexto) => {
    render(
      conTexto ? (
        <InfoTooltip content="Explicación">
          <span>Tendencias</span>
        </InfoTooltip>
      ) : (
        <InfoTooltip content="Explicación" />
      ),
    );
    const disparador = (conTexto ? screen.getByText('Tendencias').parentElement : screen.getByRole('button')) as HTMLElement;
    disparador.focus();
    expect(document.activeElement).toBe(disparador);
    fireEvent.keyDown(disparador, { key: 'Tab' });
    expect(document.activeElement).toBe(disparador);
    fireEvent.keyDown(disparador, { key: 'Escape' });
    expect(document.activeElement).not.toBe(disparador);
  });
});
