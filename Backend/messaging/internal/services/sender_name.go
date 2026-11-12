package services

import "context"

type senderNameKey struct{}

// WithSenderName attache au contexte le nom affiché de l'utilisateur authentifié (issu du token vérifié).
func WithSenderName(ctx context.Context, name string) context.Context {
	if name == "" {
		return ctx
	}
	return context.WithValue(ctx, senderNameKey{}, name)
}

// SenderNameFromContext renvoie le nom affiché de l'expéditeur, ou une chaîne vide.
func SenderNameFromContext(ctx context.Context) string {
	if name, ok := ctx.Value(senderNameKey{}).(string); ok {
		return name
	}
	return ""
}
