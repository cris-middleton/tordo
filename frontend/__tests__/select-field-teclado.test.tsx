/**
 * Los desplegables de filtro (`SelectField`: tipo, estado y región del
 * catálogo; región de Compra Ágil) se usan con el teclado y tienen nombre.
 *
 * Eran un `<button>` con una lista de `<li onClick>`: con el teclado se abría,
 * pero ni las flechas ni Enter elegían nada, y el lector de pantalla anunciaba
 * «botón, Todos los tipos». Ahora es un `<select>` nativo.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import SelectField from '@/components/SelectField';

function Filtro() {
  const [valor, setValor] = useState('');
  return (
    <>
      <SelectField
        etiqueta="Región"
        value={valor}
        onChange={setValor}
        options={[
          { value: '', label: 'Todas las regiones' },
          { value: 'Región del Biobío', label: 'Biobío' },
          { value: 'Región del Maule', label: 'Maule' },
        ]}
      />
      <output>{valor}</output>
    </>
  );
}

describe('SelectField', () => {
  it('tiene nombre y su valor es la opción elegida', () => {
    render(<Filtro />);
    const campo = screen.getByRole('combobox', { name: 'Región' });
    expect(campo.tagName).toBe('SELECT');
    expect(campo).toHaveDisplayValue('Todas las regiones');
  });

  it('se elige con el teclado', async () => {
    render(<Filtro />);
    const usuario = userEvent.setup();
    await usuario.tab();
    const campo = screen.getByRole('combobox', { name: 'Región' });
    expect(campo).toHaveFocus();
    await usuario.selectOptions(campo, 'Maule');
    expect(screen.getByRole('status')).toHaveTextContent('Región del Maule');
  });
});
