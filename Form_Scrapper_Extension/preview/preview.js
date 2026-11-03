(() => {
  const form = document.getElementById('previewForm');
  const title = document.getElementById('formTitle');
  const meta = document.getElementById('formMeta');
  const emptyState = document.getElementById('emptyState');

  const text = value => String(value ?? '');
  const optionLabel = option => text(option.label || option.text || option.value);
  const uniqueId = (step, field, index) => `pm-${step}-${text(field.id || field.name || field.label || 'field').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'field'}-${index}`;

  function describeCondition(c) {
    if (!c) return '';
    const own = `"${c.field || 'a previous question'}" is "${c.valueLabel || c.value}"`;
    return c.requires ? `${describeCondition(c.requires)} and ${own}` : own;
  }

  function appendCondition(field, container) {
    const rules = field.conditional?.showWhen || [];
    if (!rules.length) return;
    const badge = document.createElement('span');
    badge.className = 'condition';
    badge.textContent = `Shown when ${rules.map(describeCondition).join(' or ')}`;
    container.append(badge);
  }

  function inputType(field) {
    const allowed = new Set(['email', 'tel', 'url', 'number', 'date', 'datetime-local', 'month', 'week', 'time', 'password', 'search', 'color', 'range']);
    return allowed.has(field.type) ? field.type : 'text';
  }

  function buildChoices(field, id) {
    const list = document.createElement('div');
    list.className = 'choice-list';
    const multiple = field.type === 'checkbox-group';
    (field.options || []).forEach((option, index) => {
      const choice = document.createElement('label');
      choice.className = 'choice';
      const control = document.createElement('input');
      control.type = multiple ? 'checkbox' : 'radio';
      control.name = multiple ? `${id}[]` : id;
      control.value = text(option.value);
      control.checked = Boolean(option.defaultSelected);
      control.disabled = Boolean(option.disabled || field.disabled);
      if (!multiple && field.required && index === 0) control.required = true;
      choice.append(control, document.createTextNode(optionLabel(option)));
      list.append(choice);
    });
    return list;
  }

  function buildControl(field, id) {
    if (['radio', 'button-group', 'checkbox-group'].includes(field.type)) return buildChoices(field, id);

    if (field.type === 'checkbox') {
      const choice = document.createElement('label');
      choice.className = 'choice';
      const control = document.createElement('input');
      control.type = 'checkbox';
      control.id = id;
      control.name = field.name || id;
      control.required = Boolean(field.required);
      control.disabled = Boolean(field.disabled || field.readOnly);
      choice.append(control, document.createTextNode('Selected'));
      return choice;
    }

    if (field.type === 'select') {
      const control = document.createElement('select');
      control.id = id;
      control.name = field.name || id;
      control.required = Boolean(field.required);
      control.disabled = Boolean(field.disabled || field.readOnly);
      control.multiple = Boolean(field.multiple);
      const groups = new Map();
      (field.options || []).forEach(option => {
        const item = document.createElement('option');
        item.value = text(option.value);
        item.textContent = optionLabel(option);
        item.selected = Boolean(option.defaultSelected);
        item.disabled = Boolean(option.disabled);
        if (option.group) {
          if (!groups.has(option.group)) {
            const group = document.createElement('optgroup');
            group.label = option.group;
            groups.set(option.group, group);
            control.append(group);
          }
          groups.get(option.group).append(item);
        } else {
          control.append(item);
        }
      });
      return control;
    }

    if (field.type === 'textarea') {
      const control = document.createElement('textarea');
      control.id = id;
      control.name = field.name || id;
      control.placeholder = text(field.placeholder);
      control.required = Boolean(field.required);
      control.readOnly = Boolean(field.readOnly);
      control.disabled = Boolean(field.disabled);
      return control;
    }

    const control = document.createElement('input');
    control.id = id;
    control.name = field.name || id;
    control.type = field.type === 'file' ? 'file' : inputType(field);
    control.placeholder = text(field.placeholder);
    control.required = Boolean(field.required);
    control.readOnly = Boolean(field.readOnly);
    control.disabled = Boolean(field.disabled);
    if (field.accept) control.accept = field.accept;
    if (field.multiple) control.multiple = true;
    if (field.validation?.min !== undefined) control.min = field.validation.min;
    if (field.validation?.max !== undefined) control.max = field.validation.max;
    if (field.validation?.pattern) control.pattern = field.validation.pattern;
    return control;
  }

  function buildField(field, step, index) {
    const id = uniqueId(step, field, index);
    const wrapper = document.createElement('div');
    wrapper.className = 'field';
    const label = document.createElement('label');
    label.className = 'question';
    label.htmlFor = id;
    label.textContent = field.label || 'Unlabeled field';
    if (field.required) {
      const required = document.createElement('span');
      required.className = 'required';
      required.textContent = '*';
      label.append(required);
    }
    wrapper.append(label, buildControl(field, id));

    if (field.helpText) {
      const help = document.createElement('p');
      help.className = 'help';
      help.textContent = field.helpText;
      wrapper.append(help);
    }
    if (field.type === 'file' && field.accept) {
      const note = document.createElement('p');
      note.className = 'file-note';
      note.textContent = `Accepted: ${field.accept}`;
      wrapper.append(note);
    }
    appendCondition(field, wrapper);
    return wrapper;
  }

  function render(data) {
    if (!data?.steps?.length) {
      title.textContent = 'No extracted form available';
      emptyState.hidden = false;
      return;
    }
    title.textContent = data.formTitle || 'Extracted Form';
    const steps = data.summary?.capturedSteps ?? data.steps.length;
    const fieldsTotal = data.summary?.totalFields ?? data.steps.reduce((n, s) => n + (s.fields?.length || 0), 0);
    meta.textContent = `${steps} captured step${steps === 1 ? '' : 's'} · ${fieldsTotal} fields · ${data.extraction?.status || data.extractionStatus || 'partial'} extraction`;

    data.steps.forEach((step, stepIndex) => {
      const section = document.createElement('section');
      section.className = 'step';
      const head = document.createElement('div');
      head.className = 'step-head';
      const number = document.createElement('span');
      number.className = 'step-number';
      number.textContent = `Step ${step.step || stepIndex + 1}`;
      const heading = document.createElement('h2');
      heading.textContent = step.title || `Step ${stepIndex + 1}`;
      head.append(number, heading);
      const fields = document.createElement('div');
      fields.className = 'fields';
      let currentSection = null;
      (step.fields || []).forEach((field, fieldIndex) => {
        if (field.section && field.section !== currentSection) {
          currentSection = field.section;
          const heading = document.createElement('h3');
          heading.className = 'section-title';
          heading.textContent = field.section;
          fields.append(heading);
        }
        fields.append(buildField(field, step.step || stepIndex + 1, fieldIndex));
      });
      if (!step.fields?.length) {
        const noFields = document.createElement('p');
        noFields.className = 'help';
        noFields.textContent = 'No form fields were exposed on this step.';
        fields.append(noFields);
      }
      section.append(head, fields);
      form.append(section);
    });

    const issues = [
      ...(data.unvisitedSteps || []).map(u => `Not visited — ${u.title}: ${u.reason}`),
      ...(data.warnings || []).map(w => `${w.step ? `Step ${w.step}: ` : ''}${w.message}`),
    ];
    if (issues.length) {
      const box = document.createElement('section');
      box.className = 'issues';
      const heading = document.createElement('h2');
      heading.textContent = 'Limits of this extraction';
      const list = document.createElement('ul');
      issues.forEach(issue => {
        const item = document.createElement('li');
        item.textContent = issue;
        list.append(item);
      });
      box.append(heading, list);
      form.after(box);
    }
  }

  form.addEventListener('submit', event => event.preventDefault());
  chrome.storage.local.get('pm_form_preview_v1', result => render(result.pm_form_preview_v1));
})();
