package antibot

// Action is the enforcement response returned by Decide.
type Action int

const (
	ActionNone           Action = iota
	ActionThrottle              // silently halve drop rates
	ActionWithdrawFreeze        // block cash-out, allow play
	ActionShadowBan             // isolated shard, economy unaffected
	ActionHardBan               // account nuked + chain label
)

func (a Action) String() string {
	switch a {
	case ActionThrottle:
		return "throttle"
	case ActionWithdrawFreeze:
		return "withdraw_freeze"
	case ActionShadowBan:
		return "shadow_ban"
	case ActionHardBan:
		return "hard_ban"
	default:
		return "none"
	}
}

// Decide maps a flag score to an enforcement action using the escalation ladder
// defined in docs/10-anti-bot.md.
//
//	0–39  → None
//	40–59 → Throttle
//	60–74 → WithdrawFreeze
//	75–89 → ShadowBan
//	90+   → HardBan
func Decide(score int) Action {
	switch {
	case score >= 90:
		return ActionHardBan
	case score >= 75:
		return ActionShadowBan
	case score >= 60:
		return ActionWithdrawFreeze
	case score >= 40:
		return ActionThrottle
	default:
		return ActionNone
	}
}
