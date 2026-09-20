/** Domain-neutral modeling guidance, not a second copy of the engine's operation schema. */
export const BEHAVIOR_AUTHORING_PATTERNS = [
	{
		id: 'continuous-interaction',
		title: 'Continuous input, feedback and interruption',
		keywords: ['continuous', 'keyboard', 'pointer', 'hold', 'release', 'timing', 'simulation'],
		steps: [
			'Describe the user outcome and feedback first. Record input modality, direction/axis, valid range and units; distinguish press, hold, release and cancellation.',
			'Model explicit phases and sampled updates using state definitions, action parameters, guards and arithmetic effects. A numeric parameter can represent elapsed time; document the unit, accepted range and sampling assumptions.',
			'Keep simulation time distinct from wall-clock time. Model pause, speed changes and resume explicitly, including release or focus loss while paused.',
			'Author positive and negative scenarios at boundary values: zero elapsed time, minimum/maximum input, interruption, completion and retry. Invariants should constrain the state; do not replace the requested behavior with a trivial invariant.',
			'Keep same-screen interactions on the same screen. Use steps[].actions for an exact interaction sequence, or let the bounded planner discover enabling controls. A representative prototype control must be identified as an abstraction.'
		],
		verificationBoundary: 'The formal model checks sampled state transitions, not frame rate, physical realism, motion quality or usability. Verify those in the implementation with reproducible inputs, measured tolerances and user-visible acceptance criteria.'
	},
	{
		id: 'spatial-observation',
		title: 'Spatial or sensor-driven observations',
		keywords: ['spatial', 'visibility', 'sensor', 'occlusion', 'collision', 'geometry'],
		steps: [
			'Separate the observation produced by the runtime from the product rule that consumes it. Model the observation as a typed input with explicit validity conditions.',
			'Distinguish unknown, observed and accepted states; record whether a condition requires an event sequence rather than a final position alone.',
			'Test observations that should not be accepted, duplicate events, out-of-order events, missing observations and tolerance boundaries.',
			'Attach implementation evidence for the observer and the rule separately, with tests covering the real geometry, sensor data or visualization that produces the input.'
		],
		verificationBoundary: 'A scenario setting visible=true or contact=true proves the reaction to that input, not that the runtime detects visibility or contact correctly.'
	},
	{
		id: 'runtime-evidence',
		title: 'From modeled rules to implementation evidence',
		keywords: ['evidence', 'runtime', 'acceptance', 'traceability', 'implementation'],
		steps: [
			'For each capability, keep the authored rule, its model scenario, implementing code and runtime acceptance test identifiable. Register documents separately from attached code sources.',
			'Capture the code with attach_source and record_element_spans, then synchronize the implementation index. A file location or signature establishes a mapping, not a passing runtime test.',
			'Record the actual test command, revision, deterministic inputs, expected observable, tolerance when relevant, result and artifact location. Do not invent measurements, screenshots or successful runs.',
			'Keep structural maturity, passing scenarios, exploration bounds, prototype journeys, implementation coverage and project closure separate. Missing or partial evidence stays explicit.'
		],
		verificationBoundary: 'A passing model or prototype does not establish implementation correctness. Full project completion still requires the declared section assessments and a fresh scope audit.'
	},
	{
		id: 'measured-thresholds',
		title: 'Thresholds that only a measurement can settle',
		keywords: ['threshold', 'tuning', 'tuned', 'measured', 'census', 'constant', 'provisional', 'calibration'],
		steps: [
			'Specify the rule before the number: its inputs, its shape (at least, at most, within, a share of) and the invariants it must keep. That part is a decision and comes first.',
			'Declare the number with add_constant and reference it with {kind:"const", name}. While it is a guess, say so in its description, with the measurement that will settle it. A provisional value is honest; a guessed value written as a decision is not.',
			'When the value is bounded by another quantity (a hearing distance by what the screen shows, a cooldown by a session length), state the relation and guard it with an invariant over both, so the relation is the rule and the number follows.',
			'Write the code, measure on the real product or the generated data, then update the constant once, in the same turn. Record the measurement as implementation evidence: the command, its inputs and the observed figure.'
		],
		verificationBoundary: 'Scenarios prove the rule reacts correctly to the number it is given, never that the number is right. Only a measurement on the running product or on the generated data shows that.'
	},
	{
		id: 'once-per-episode',
		title: 'Tell or do something once per episode',
		keywords: ['once', 'first time', 'per visit', 'per stay', 'notify once', 'announce', 'journal', 'dedupe'],
		steps: [
			'Name the episode and the two moments that bound it (entering and leaving the river, opening and closing the session). "Once" always means once per something.',
			'Hold one boolean state for the episode, false by default. The telling action is blocked while it is true, and sets it to true as its effect.',
			'Reset the flag as an effect of the action that ALREADY ends the episode, instead of authoring a separate reset action. If nothing in the feature ends the episode, add one ingest action for it and no more.',
			'Two scenarios carry the behavior: the first telling succeeds and sets the flag; a second telling inside the same episode is blocked. A third proves that ending the episode allows it again.'
		],
		verificationBoundary: 'The model proves that the flag gates the telling. It does not prove that the runtime detects the start and the end of the episode correctly; test that detection in the implementation.'
	}
] as const;
