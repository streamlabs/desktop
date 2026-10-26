import { test, useWebdriver } from '../../helpers/webdriver';
import { focusMain, getClient } from '../../helpers/modules/core';
import { useForm } from '../../helpers/modules/forms';

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Form controllers find replaced inputs by name within their form', async t => {
  await focusMain();
  const client = getClient();
  const fieldName = 'feature["streamShift"]';
  await client.execute((name: string) => {
    const fixture = document.createElement('div');
    fixture.id = 'form-rerender-fixture';
    Object.assign(fixture.style, {
      position: 'fixed',
      left: '100px',
      top: '100px',
      zIndex: '2147483647',
    });
    for (const formName of ['replaced-inputs', 'other-inputs']) {
      const form = document.createElement('div');
      form.dataset.role = 'form';
      form.dataset.name = formName;
      const button = document.createElement('button');
      button.dataset.role = 'input';
      button.dataset.type = 'switch';
      button.dataset.name = name;
      button.value = 'false';
      button.textContent = formName;
      button.id = `${formName}-original`;
      form.appendChild(button);
      fixture.appendChild(form);
    }
    document.body.appendChild(fixture);
  }, fieldName);

  try {
    // Keep a controller across a rerender, as a pending Go Live update can do.
    const input = await useForm('replaced-inputs').getInput(fieldName);
    await client.execute(() => {
      const original = document.getElementById('replaced-inputs-original') as HTMLButtonElement;
      const replacement = original.cloneNode(true) as HTMLButtonElement;
      replacement.id = 'replaced-inputs-current';
      replacement.onclick = () => {
        replacement.value = String(replacement.value !== 'true');
      };
      original.replaceWith(replacement);
      const unrelated = replacement.cloneNode(true) as HTMLButtonElement;
      unrelated.id = 'unrelated-input';
      unrelated.dataset.name = 'unrelated';
      replacement.parentElement.prepend(unrelated);
    });

    // Browser execute rejects a stale reference directly, avoiding WebdriverIO's
    // element-command retry loop if this regression reintroduces a cached handle.
    t.is(
      await client.execute(
        (element: unknown) => (element as HTMLElement).id,
        await input.getElement(),
      ),
      'replaced-inputs-current',
    );
    await input.setDisplayValue(true);
    t.is(await input.getValue(), true);
    t.deepEqual(
      await client.execute(() =>
        ['unrelated-input', 'other-inputs-original'].map(
          id => (document.getElementById(id) as HTMLButtonElement).value,
        ),
      ),
      ['false', 'false'],
    );
  } finally {
    await client.execute(() => document.getElementById('form-rerender-fixture')?.remove());
  }
});
