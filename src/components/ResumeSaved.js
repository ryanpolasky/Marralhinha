import React from 'react';
import { Trash } from './Icons';

export default function ResumeSaved({ label, onResume, onDiscard }) {
  return (
    <div className="resume-saved">
      <button className="btn ghost block" onClick={onResume}>
        {label}
      </button>
      <button className="icon-btn resume-trash" onClick={onDiscard} aria-label="Delete saved game" title="Delete saved game">
        <Trash />
      </button>
    </div>
  );
}
