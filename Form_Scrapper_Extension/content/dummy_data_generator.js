/**
 * content/dummy_data_generator.js
 * Modular synthetic data generator — completely independent of extraction engine.
 * Produces fictional, validation-compatible, non-sensitive test values only.
 */

window.PracticeMode = window.PracticeMode || {};

window.PracticeMode.dummyDataGenerator = (() => {
  // ──────────────────────────────────────────────
  // Static fictional data pools
  // ──────────────────────────────────────────────
  const FIRST_NAMES = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Sam', 'Drew'];
  const LAST_NAMES = ['Example', 'Sample', 'Testuser', 'Demo', 'Placeholder'];
  const CITIES = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'];
  const STATES = ['NY', 'CA', 'IL', 'TX', 'AZ'];
  const STREETS = ['123 Main St', '456 Oak Ave', '789 Pine Rd', '321 Elm St'];
  const COMPANIES = ['Example Corp', 'Demo Inc', 'Sample LLC', 'Test Enterprises'];
  const JOB_TITLES = ['Software Engineer', 'Project Manager', 'Data Analyst', 'Designer'];
  const SCHOOLS = ['State University', 'City College', 'Example Academy'];
  const DEGREES = ["Bachelor's", "Master's", 'High School Diploma', 'Associate Degree'];
  const MAJORS = ['Computer Science', 'Business', 'Engineering', 'Communications'];

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function constraints(field) {
    return {
      minLength: field.minLength ?? field.validation?.minLength,
      maxLength: field.maxLength ?? field.validation?.maxLength,
      min: field.min ?? field.validation?.min,
      max: field.max ?? field.validation?.max,
      pattern: field.pattern ?? field.validation?.pattern,
    };
  }

  function withinRange(value, min, max) {
    if (min && value < min) return min;
    if (max && value > max) return max;
    return value;
  }

  // ──────────────────────────────────────────────
  // Field-type generators
  // ──────────────────────────────────────────────

  const generators = {
    // Text inputs by semantic hint
    text(field) {
      const label = (field.label || field.name || '').toLowerCase();
      const { minLength, maxLength } = constraints(field);
      if (/first.?name|given.?name|fname/i.test(label)) return pick(FIRST_NAMES);
      if (/last.?name|surname|family.?name|lname/i.test(label)) return pick(LAST_NAMES);
      if (/full.?name/i.test(label)) return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
      if (/city/i.test(label)) return pick(CITIES);
      if (/state|province/i.test(label)) return pick(STATES);
      if (/street|address\s*1|addr/i.test(label)) return pick(STREETS);
      if (/address\s*2|apt|suite/i.test(label)) return 'Apt 4B';
      if (/zip|postal/i.test(label)) return '10001';
      if (/company|employer|organization/i.test(label)) return pick(COMPANIES);
      if (/job.?title|position|role/i.test(label)) return pick(JOB_TITLES);
      if (/school|university|college|institution/i.test(label)) return pick(SCHOOLS);
      if (/major|field.?of.?study/i.test(label)) return pick(MAJORS);
      if (/degree/i.test(label)) return pick(DEGREES);
      if (/country/i.test(label)) return 'United States';
      if (/linkedin/i.test(label)) return 'https://www.linkedin.com/in/alexexample';
      if (/website|url|portfolio/i.test(label)) return 'https://example.com';
      if (/gpa/i.test(label)) return '3.8';
      // Respect minlength/maxlength
      const min = parseInt(minLength) || 3;
      const max = parseInt(maxLength) || 20;
      const base = 'TestValue';
      return base.repeat(Math.ceil(min / base.length)).slice(0, Math.min(max, 20));
    },

    email(field) {
      return 'alex@example.com';
    },

    tel(field) {
      return '212-555-0100';
    },

    number(field) {
      const label = (field.label || field.name || '').toLowerCase();
      const limits = constraints(field);
      const min = Number.isFinite(parseFloat(limits.min)) ? parseFloat(limits.min) : 0;
      const max = Number.isFinite(parseFloat(limits.max)) ? parseFloat(limits.max) : 100;

      if (/year|grad/i.test(label)) return String(withinRange(2020, min, max));
      if (/age/i.test(label)) return String(withinRange(28, min, max));
      if (/salary|income/i.test(label)) return String(withinRange(55000, min, max));
      if (/gpa/i.test(label)) return Math.min(4.0, Math.max(min, 3.8)).toString();

      const mid = Math.floor((min + max) / 2);
      return mid.toString();
    },

    date(field) {
      const label = (field.label || field.name || '').toLowerCase();
      const { min, max } = constraints(field);
      const chooseDate = (preferred) => {
        if (min && preferred < min) return min;
        if (max && preferred > max) return max;
        return preferred;
      };
      if (/birth|dob|born/i.test(label)) {
        return chooseDate('1995-05-15');
      }
      if (/start|begin|from/i.test(label)) return chooseDate('2018-01-15');
      if (/end|to|through|until/i.test(label)) return chooseDate('2022-12-31');
      if (/grad/i.test(label)) return chooseDate('2020-05-10');
      return chooseDate('2020-01-01');
    },

    'datetime-local'(field) {
      return '2020-01-01T09:00';
    },

    month(field) {
      return '2020-01';
    },

    week(field) {
      return '2020-W01';
    },

    time(field) {
      return '09:00';
    },

    url(field) {
      return 'https://example.com';
    },

    password(field) {
      // Do NOT generate real passwords. Return a safe test token.
      return 'TestPass!2025';
    },

    search(field) {
      return 'example search';
    },

    range(field) {
      const min = parseFloat(field.min) || 0;
      const max = parseFloat(field.max) || 100;
      return Math.floor((min + max) / 2).toString();
    },

    color(field) {
      return '#4a90e2';
    },

    textarea(field) {
      const label = (field.label || field.name || '').toLowerCase();
      if (/bio|about|summary|profile/i.test(label)) {
        return 'I am a test user created by PracticeMode for form extraction purposes.';
      }
      if (/cover.?letter|statement/i.test(label)) {
        return 'This is a sample cover letter generated for form extraction testing. It does not represent a real application.';
      }
      if (/reason|why/i.test(label)) {
        return 'I am interested in this opportunity for professional growth and development.';
      }
      const min = parseInt(field.minLength) || 50;
      const text = 'This is a sample text entry generated for form extraction and testing purposes by PracticeMode.';
      return text.repeat(Math.ceil(min / text.length)).slice(0, Math.max(min, text.length));
    },

    select(field) {
      // Choose first non-empty, non-placeholder option
      if (field.options && field.options.length > 0) {
        const validOptions = field.options.filter(
          (o) => o.value !== '' && !o.disabled && !/select|choose|pick|--/i.test(o.text)
        );
        return validOptions.length > 0 ? validOptions[0].value : field.options[0].value;
      }
      return '';
    },

    radio(field) {
      if (field.options && field.options.length > 0) {
        return field.options[0].value;
      }
      return '';
    },

    'button-group'(field) {
      const option = (field.options || []).find(option => !option.disabled);
      return option?.value || '';
    },

    checkbox(field) {
      // Only check if required
      return field.required ? true : false;
    },

    file(field) {
      // Cannot safely generate file uploads — signal manual assistance needed
      return null;
    },
  };

  // ──────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────

  /**
   * Generate a fictional value for a given field descriptor.
   * Returns { value, requiresManual: false } or { value: null, requiresManual: true, reason: '...' }
   */
  function generate(field) {
    // Identity-sensitive — never auto-generate
    const label = (field.label || field.name || '').toLowerCase();
    const sensitivePatterns = [
      /ssn|social.?security/i,
      /passport/i,
      /driver.?licen/i,
      /tax.?id|ein\b|tin\b/i,
      /credit.?card|card.?number|cvv|ccv/i,
      /bank.?account|routing.?number/i,
      /national.?id/i,
    ];
    for (const pat of sensitivePatterns) {
      if (pat.test(label)) {
        return {
          value: null,
          requiresManual: true,
          reason: `Field "${field.label}" appears to be identity-sensitive. Manual input required.`,
        };
      }
    }

    // File uploads
    if (field.type === 'file') {
      return {
        value: null,
        requiresManual: true,
        reason: `Field "${field.label}" is a file upload. Manual input required.`,
      };
    }

    const generatorFn = generators[field.type] || generators.text;
    let value;
    try {
      value = generatorFn(field);
    } catch (e) {
      return {
        value: null,
        requiresManual: true,
        reason: `Could not generate value for "${field.label}": ${e.message}`,
      };
    }

    // A declared pattern is a constraint, not merely metadata. Support the
    // common patterns that are safe to synthesize; leave unfamiliar patterns
    // for manual input instead of sending a likely-invalid value.
    const { pattern } = constraints(field);
    if (pattern && field.type === 'text') {
      if (/\\d\{5\}/.test(pattern)) value = '10001';
      else if (/\\d/.test(pattern) && /[a-z]/i.test(pattern)) {
        return { value: null, requiresManual: true, reason: `Pattern for "${field.label}" needs manual input.` };
      }
    }

    return { value, requiresManual: false };
  }

  /**
   * Generate values for an array of fields.
   * Returns array of { field, value, requiresManual, reason? }
   */
  function generateForFields(fields) {
    return fields.map((field) => {
      const result = generate(field);
      return { field, ...result };
    });
  }

  return { generate, generateForFields };
})();
