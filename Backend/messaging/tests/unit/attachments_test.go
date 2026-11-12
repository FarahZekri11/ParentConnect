package unit

import (
	"testing"

	"github.com/parentconnect/messaging-service/internal/attachments"
	"github.com/parentconnect/messaging-service/internal/models"
	"github.com/parentconnect/messaging-service/internal/services"
)

func TestDetectImageTypeAcceptsOnlyImages(t *testing.T) {
	png := []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 'I', 'H', 'D', 'R'}
	if ct, ok := attachments.DetectImageType(png); !ok || ct != "image/png" {
		t.Fatalf("PNG attendu, obtenu %q (%v)", ct, ok)
	}
	jpg := []byte{0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 'J', 'F', 'I', 'F', 0, 1}
	if _, ok := attachments.DetectImageType(jpg); !ok {
		t.Fatal("JPEG refusé")
	}
	for _, bad := range [][]byte{[]byte("<script>alert(1)</script>"), []byte("%PDF-1.7 ..."), []byte("MZ\x90\x00 exe")} {
		if ct, ok := attachments.DetectImageType(bad); ok {
			t.Fatalf("fichier non image accepté comme %q", ct)
		}
	}
}

func TestPreviewText(t *testing.T) {
	cases := []struct {
		msg  models.Message
		want string
	}{
		{models.Message{Content: "Bonjour"}, "Bonjour"},
		{models.Message{Attachments: []models.Attachment{{ID: "a"}}}, "📷 Photo"},
		{models.Message{Attachments: []models.Attachment{{ID: "a"}, {ID: "b"}}}, "📷 2 photos"},
		{models.Message{Content: "x", Deleted: true}, "Message supprimé"},
	}
	for _, c := range cases {
		if got := services.PreviewText(&c.msg); got != c.want {
			t.Errorf("PreviewText = %q, attendu %q", got, c.want)
		}
	}
}
