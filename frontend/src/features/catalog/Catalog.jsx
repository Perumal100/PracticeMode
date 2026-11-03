// US-02: search approved practice forms by keyword and several categories.
import { useEffect, useState } from 'react';
import { listForms as defaultListForms } from '../../api/catalog.js';

export default function Catalog({ onOpen, listForms = defaultListForms }) {
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [state, setState] = useState({ status: 'loading', forms: [], error: null });

  async function search(filters) {
    setState((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const forms = await listForms(filters);
      setState({ status: 'ready', forms, error: null });
      return forms;
    } catch (error) {
      setState({
        status: 'error',
        forms: [],
        error: error?.status === 400 ? 'Those search terms are not valid. Shorten them and try again.' : 'The form list could not be loaded. Please try again.',
      });
      return null;
    }
  }

  useEffect(() => {
    // The unfiltered list supplies the category choices.
    search({}).then((forms) => {
      if (forms) setAllCategories([...new Set(forms.flatMap((f) => f.categories ?? []))].sort());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(category) {
    setSelected((current) => (current.includes(category) ? current.filter((c) => c !== category) : [...current, category]));
  }

  function submit(event) {
    event.preventDefault();
    search({ keyword, categories: selected });
  }

  return (
    <section>
      <h2>Practice forms</h2>
      <form className="card search" onSubmit={submit} role="search">
        <label>
          Search by title
          <input value={keyword} maxLength={200} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. housing" />
        </label>
        {allCategories.length > 0 && (
          <fieldset>
            <legend>Categories</legend>
            {allCategories.map((category) => (
              <label key={category} className="chip">
                <input type="checkbox" checked={selected.includes(category)} onChange={() => toggle(category)} />
                {category}
              </label>
            ))}
          </fieldset>
        )}
        <button type="submit" className="primary">Search</button>
      </form>

      {state.status === 'loading' && <p className="muted">Loading forms…</p>}
      {state.status === 'error' && <p role="alert" className="error">{state.error}</p>}
      {state.status === 'ready' && state.forms.length === 0 && (
        <p role="status" className="card">No practice forms match your search. Try other words or fewer categories.</p>
      )}
      {state.status === 'ready' && state.forms.length > 0 && (
        <ul className="form-list">
          {state.forms.map((form) => (
            <li key={form.id} className="card">
              <div>
                <strong>{form.title}</strong>
                {form.categories?.length > 0 && <div className="muted">{form.categories.join(' · ')}</div>}
              </div>
              <button type="button" onClick={() => onOpen(form.id)}>Practise</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
