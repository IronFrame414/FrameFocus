// S110 H — /m system text, area "visit": the site visit RECORD and its voice
// notes (components/site-visits/site-visit-record.tsx, voice-notes.tsx). Keys
// are prefixed "visit.". `es` is typed against `en`'s keys: a key in one and
// not the other is a compile error. English text must stay BYTE-IDENTICAL to
// what the screen showed before (e2e specs assert it — 'Photos · 1', 'Edit').
//
// Both components are shared by /m AND /dashboard: the dashboard layout pins
// uiLang to 'en', so these Spanish strings reach /m only.
//
// ⚠️ UNITS: 'ft' and 'sq ft' are not translated, in either language.

export const en = {
  // ── note sections ──
  'visit.kind.condition.title': 'Existing conditions',
  'visit.kind.condition.add': 'Add condition',
  'visit.kind.condition.placeholder':
    'What is there now — e.g. "Tile is cracked, subfloor may be soft"',
  'visit.kind.scope.title': 'Proposed scope',
  'visit.kind.scope.add': 'Add scope item',
  'visit.kind.scope.placeholder': 'What the work is — e.g. "Demo tile, level, install LVP"',
  'visit.kind.blocker.title': 'Blockers — what stops a price',
  'visit.kind.blocker.add': 'Add blocker',
  'visit.kind.blocker.placeholder': 'e.g. "Need access to the crawlspace", "Permit question"',
  'visit.noneYet': 'None yet.',
  'visit.blocker.resolvedReopen': 'Resolved — tap to reopen',
  'visit.blocker.markResolved': 'Mark resolved',
  'visit.addedAfterSend': 'Added after the estimate was sent',
  'visit.save': 'Save',
  'visit.cancel': 'Cancel',
  'visit.edit': 'Edit',
  'visit.remove': 'Remove',
  'visit.didNotSave': 'That did not save.',
  // ── photos ──
  'visit.photo.cannotHold': 'A photo did not upload and cannot be held on this device. Try again.',
  'visit.photo.heldOne': '{n} photo saved on this phone — they upload when signal returns.',
  'visit.photo.heldMany': '{n} photos saved on this phone — they upload when signal returns.',
  'visit.photos.title': 'Photos',
  'visit.waitingForSignal': '{n} waiting for signal',
  'visit.photos.none': 'No photos yet.',
  'visit.photos.before': 'Captured before the estimate was sent',
  'visit.photos.after': 'Added after it was sent',
  'visit.photos.filesTabStays': "Files added from the estimate's Files tab stay there.",
  'visit.photos.add': 'Add photos',
  // ── banners ──
  'visit.promoted.title': 'This visit is now an estimate.',
  'visit.promoted.canWrite': 'The team can still add to it and fix it here until the estimate is sent.',
  'visit.promoted.readOnly': 'You can still read everything captured on it.',
  'visit.frozen.title': 'The estimate has been sent.',
  'visit.frozen.body':
    'What was captured before then is frozen — it is the record of what was found on site at the price quoted.',
  'visit.frozen.canAdd':
    'You can still add notes, measurements, photos and voice notes; they are marked as added after the send.',
  'visit.finished.title': 'Finished',
  'visit.finished.body':
    '— ready for the office to price. It becomes an estimate, and gets its number, only when the office creates one.',
  'visit.finished.canFix': 'Mistakes can still be fixed here until then.',
  'visit.offline':
    'No signal — photos and voice notes are saved on this phone and upload later. Notes and measurements need a connection.',
  'visit.blockers.none': 'Nothing blocking a price.',
  'visit.blockers.openOne': '{n} blocker still open.',
  'visit.blockers.openMany': '{n} blockers still open.',
  // ── measurements ──
  'visit.measurements.title': 'Measurements',
  'visit.measurements.total': '· {n} sq ft total',
  'visit.measurements.row': '{l} × {w} ft = {sqft} sq ft',
  'visit.measurements.area': 'Area (e.g. Kitchen)',
  'visit.measurements.length': 'L ft',
  'visit.measurements.width': 'W ft',
  'visit.measurements.add': 'Add measurement',
  'visit.measurements.addWithPreview': 'Add measurement · {n} sq ft',
  // ── finish ──
  // The confirm sentence carries a <strong>: each language arranges its OWN
  // three pieces (before / emphasised / after).
  'visit.finish.confirmBefore':
    'Finish this visit? The office sees it is ready to price. It does',
  'visit.finish.confirmStrong': 'not',
  'visit.finish.confirmAfter':
    'become an estimate yet — the office does that. You can still fix mistakes until then.',
  'visit.finish.blockersOne': '{n} blocker is still open.',
  'visit.finish.blockersMany': '{n} blockers are still open.',
  'visit.finish.heldOne':
    '{n} photo or voice note is still on this phone and will upload when signal returns.',
  'visit.finish.heldMany':
    '{n} photo or voice notes are still on this phone and will upload when signal returns.',
  'visit.finish.yes': 'Yes, finish the visit',
  'visit.finish.keepRecording': 'Keep recording',
  'visit.finish.start': 'Finish site visit',
  'visit.finish.needsConnection': 'Finishing needs a connection.',
  // ── voice notes ──
  'visit.voice.empty': 'That recording is empty.',
  'visit.voice.tooLong':
    'Voice notes are limited to 10 minutes. This one was not sent — record it in shorter parts.',
  'visit.voice.noMic': 'The microphone is not available. Allow microphone access and try again.',
  'visit.voice.transcriptFailedSaved':
    'Saved. The transcript did not come through — tap "Try again" on the note.',
  'visit.voice.cannotHold':
    'The recording did not upload and cannot be held on this device. Record it again with signal.',
  'visit.voice.heldOnPhone': 'Saved on this phone — it uploads and transcribes when signal returns.',
  'visit.voice.title': 'Voice notes',
  'visit.voice.saving': 'Saving…',
  'visit.voice.stop': 'Stop · {time} / 10:00',
  'visit.voice.record': 'Record a voice note',
  'visit.voice.unsupported': 'This browser cannot record audio.',
  'visit.voice.transcriptEdited': 'transcript edited',
  'visit.voice.addedAfterSend': 'added after the estimate was sent',
  'visit.voice.transcribing': 'Transcribing…',
  'visit.voice.failed': 'The transcript did not come through. The recording is saved.',
  'visit.voice.stillFailed': 'Still did not come through.',
  'visit.voice.trying': 'Trying…',
  'visit.voice.tryAgain': 'Try again',
  'visit.voice.couldNotSave': 'Could not save.',
  'visit.voice.nothingHeard': '(nothing heard)',
  'visit.voice.editTranscript': 'Edit transcript',
} as const;

export const es: Record<keyof typeof en, string> = {
  'visit.kind.condition.title': 'Condiciones actuales',
  'visit.kind.condition.add': 'Agregar condición',
  'visit.kind.condition.placeholder':
    'Lo que hay ahora — p. ej. "El azulejo está roto, el subpiso puede estar blando"',
  'visit.kind.scope.title': 'Alcance propuesto',
  'visit.kind.scope.add': 'Agregar trabajo',
  'visit.kind.scope.placeholder':
    'Qué trabajo hay que hacer — p. ej. "Quitar azulejo, nivelar, instalar LVP"',
  'visit.kind.blocker.title': 'Pendientes — lo que impide dar un precio',
  'visit.kind.blocker.add': 'Agregar pendiente',
  'visit.kind.blocker.placeholder': 'p. ej. "Necesito acceso al entrepiso", "Duda sobre el permiso"',
  'visit.noneYet': 'Nada todavía.',
  'visit.blocker.resolvedReopen': 'Resuelto — toca para reabrir',
  'visit.blocker.markResolved': 'Marcar como resuelto',
  'visit.addedAfterSend': 'Agregado después de enviar el presupuesto',
  'visit.save': 'Guardar',
  'visit.cancel': 'Cancelar',
  'visit.edit': 'Editar',
  'visit.remove': 'Quitar',
  'visit.didNotSave': 'No se guardó.',
  'visit.photo.cannotHold':
    'Una foto no se subió y no se puede guardar en este dispositivo. Inténtalo de nuevo.',
  'visit.photo.heldOne': '{n} foto guardada en este teléfono — se sube cuando vuelva la señal.',
  'visit.photo.heldMany': '{n} fotos guardadas en este teléfono — se suben cuando vuelva la señal.',
  'visit.photos.title': 'Fotos',
  'visit.waitingForSignal': '{n} esperando señal',
  'visit.photos.none': 'Todavía no hay fotos.',
  'visit.photos.before': 'Tomadas antes de enviar el presupuesto',
  'visit.photos.after': 'Agregadas después de enviarlo',
  'visit.photos.filesTabStays':
    'Los archivos agregados desde la pestaña Archivos del presupuesto se quedan ahí.',
  'visit.photos.add': 'Agregar fotos',
  'visit.promoted.title': 'Esta visita ya es un presupuesto.',
  'visit.promoted.canWrite':
    'El equipo todavía puede agregar y corregir cosas aquí hasta que se envíe el presupuesto.',
  'visit.promoted.readOnly': 'Todavía puedes ver todo lo que se registró.',
  'visit.frozen.title': 'El presupuesto ya se envió.',
  'visit.frozen.body':
    'Lo que se registró antes está congelado — es el registro de lo que se encontró en la obra al precio cotizado.',
  'visit.frozen.canAdd':
    'Todavía puedes agregar notas, medidas, fotos y notas de voz; se marcan como agregadas después del envío.',
  'visit.finished.title': 'Terminada',
  'visit.finished.body':
    '— lista para que la oficina le ponga precio. Se convierte en presupuesto, y recibe su número, solo cuando la oficina lo crea.',
  'visit.finished.canFix': 'Todavía se pueden corregir errores aquí hasta entonces.',
  'visit.offline':
    'Sin señal — las fotos y las notas de voz se guardan en este teléfono y se suben después. Las notas y las medidas necesitan conexión.',
  'visit.blockers.none': 'Nada impide dar un precio.',
  'visit.blockers.openOne': '{n} pendiente sigue abierto.',
  'visit.blockers.openMany': '{n} pendientes siguen abiertos.',
  'visit.measurements.title': 'Medidas',
  'visit.measurements.total': '· {n} sq ft en total',
  'visit.measurements.row': '{l} × {w} ft = {sqft} sq ft',
  'visit.measurements.area': 'Área (p. ej. Cocina)',
  'visit.measurements.length': 'Largo ft',
  'visit.measurements.width': 'Ancho ft',
  'visit.measurements.add': 'Agregar medida',
  'visit.measurements.addWithPreview': 'Agregar medida · {n} sq ft',
  'visit.finish.confirmBefore':
    '¿Terminar esta visita? La oficina verá que está lista para ponerle precio. Todavía',
  'visit.finish.confirmStrong': 'no',
  'visit.finish.confirmAfter':
    'se convierte en presupuesto — eso lo hace la oficina. Puedes corregir errores hasta entonces.',
  'visit.finish.blockersOne': '{n} pendiente sigue abierto.',
  'visit.finish.blockersMany': '{n} pendientes siguen abiertos.',
  'visit.finish.heldOne':
    '{n} foto o nota de voz sigue en este teléfono y se subirá cuando vuelva la señal.',
  'visit.finish.heldMany':
    '{n} fotos o notas de voz siguen en este teléfono y se subirán cuando vuelva la señal.',
  'visit.finish.yes': 'Sí, terminar la visita',
  'visit.finish.keepRecording': 'Seguir registrando',
  'visit.finish.start': 'Terminar la visita de obra',
  'visit.finish.needsConnection': 'Para terminar necesitas conexión.',
  'visit.voice.empty': 'La grabación está vacía.',
  'visit.voice.tooLong':
    'Las notas de voz tienen un límite de 10 minutos. Esta no se envió — grábala en partes más cortas.',
  'visit.voice.noMic':
    'El micrófono no está disponible. Permite el acceso al micrófono e inténtalo de nuevo.',
  'visit.voice.transcriptFailedSaved':
    'Guardada. La transcripción no llegó — toca "Intentar de nuevo" en la nota.',
  'visit.voice.cannotHold':
    'La grabación no se subió y no se puede guardar en este dispositivo. Grábala otra vez con señal.',
  'visit.voice.heldOnPhone':
    'Guardada en este teléfono — se sube y se transcribe cuando vuelva la señal.',
  'visit.voice.title': 'Notas de voz',
  'visit.voice.saving': 'Guardando…',
  'visit.voice.stop': 'Detener · {time} / 10:00',
  'visit.voice.record': 'Grabar una nota de voz',
  'visit.voice.unsupported': 'Este navegador no puede grabar audio.',
  'visit.voice.transcriptEdited': 'transcripción editada',
  'visit.voice.addedAfterSend': 'agregada después de enviar el presupuesto',
  'visit.voice.transcribing': 'Transcribiendo…',
  'visit.voice.failed': 'La transcripción no llegó. La grabación está guardada.',
  'visit.voice.stillFailed': 'Todavía no llegó.',
  'visit.voice.trying': 'Intentando…',
  'visit.voice.tryAgain': 'Intentar de nuevo',
  'visit.voice.couldNotSave': 'No se pudo guardar.',
  'visit.voice.nothingHeard': '(no se oyó nada)',
  'visit.voice.editTranscript': 'Editar transcripción',
};
