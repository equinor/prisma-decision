import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ShortcutChoice } from './QuickStart';

const shortcut = {
	label: 'Build the influence diagram',
	message: 'Build the influence diagram for me.',
	extras: [
		{ label: 'Probabilities', message: 'Also propose the probabilities.' },
		{ label: 'Utility values', message: 'Also propose the utility values.' },
	],
};

describe('ShortcutChoice', () => {
	it('sends only the message when nothing is ticked', async () => {
		const onSend = vi.fn();
		render(<ShortcutChoice shortcut={shortcut} disabled={false} onSend={onSend} />);
		await userEvent.click(screen.getByRole('button', { name: shortcut.label }));
		expect(onSend).toHaveBeenCalledWith('Build the influence diagram for me.');
	});

	it('appends the message of every ticked extra', async () => {
		const onSend = vi.fn();
		render(<ShortcutChoice shortcut={shortcut} disabled={false} onSend={onSend} />);
		await userEvent.click(screen.getByLabelText('Probabilities'));
		await userEvent.click(screen.getByLabelText('Utility values'));
		await userEvent.click(screen.getByRole('button', { name: shortcut.label }));
		expect(onSend).toHaveBeenCalledWith(
			'Build the influence diagram for me. Also propose the probabilities. Also propose the utility values.',
		);
	});
});
