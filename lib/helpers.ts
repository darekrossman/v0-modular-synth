// Helper to get shared AudioContext
export function getAudioContext(): AudioContext {
	const w: Window & { __ac?: AudioContext } = window;
	if (!w.__ac) w.__ac = new window.AudioContext();
	if (w.__ac.state === 'suspended') w.__ac.resume();
	return w.__ac as AudioContext;
}
