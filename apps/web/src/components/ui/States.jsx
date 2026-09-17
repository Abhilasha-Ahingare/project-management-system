export function Loading({ text = "Loading..." }) {
  return <div className="surface state">{text}</div>;
}
export function Empty({ title, text }) {
  return (
    <div className="surface state">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}
export function Failed({ retry }) {
  return (
    <div className="surface state error">
      <strong>Unable to load this data.</strong>
      <button className="button secondary" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
