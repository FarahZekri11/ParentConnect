<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Photos des publications : téléversement depuis l'ordinateur et affichage public (les publications le sont).
 * Le type est vérifié sur le contenu réel du fichier ; le nom d'origine n'est jamais réutilisé.
 */
class PostImageController extends Controller
{
    public const URL_PREFIX = '/api/posts/images/';

    /** Nom généré par le service : UUID v4 + extension autorisée (aucune traversée de chemin possible). */
    public const NAME_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/';

    private const EXTENSIONS = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
    ];

    public static function directory(): string
    {
        return storage_path('app/post-images');
    }

    #[OA\Post(
        path: '/api/posts/images',
        summary: 'Téléverser des photos pour une publication',
        description: 'multipart/form-data, champ files[] : 4 images JPEG, PNG, WebP ou GIF de 5 Mo maximum. Renvoie les URL à placer dans images[].',
        tags: ['Posts'],
        security: [['bearerAuth' => []]],
        responses: [
            new OA\Response(response: 201, description: '{ urls: string[] }'),
            new OA\Response(response: 422, description: 'Fichier absent, trop lourd ou qui n\'est pas une image'),
        ]
    )]
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'files' => ['required', 'array', 'min:1', 'max:4'],
            'files.*' => ['file', 'max:5120', 'mimetypes:image/jpeg,image/png,image/webp,image/gif'],
        ], [
            'files.required' => 'Aucune image reçue.',
            'files.max' => '4 images maximum par publication.',
            'files.*.max' => 'Chaque image doit faire 5 Mo au maximum.',
            'files.*.mimetypes' => 'Formats acceptés : JPEG, PNG, WebP ou GIF.',
        ]);

        $dir = self::directory();
        if (! is_dir($dir)) {
            mkdir($dir, 0750, true);
        }

        $urls = [];
        foreach ($request->file('files') as $file) {
            // Type déterminé par finfo sur le contenu (et non par l'extension ou le type annoncé par le navigateur)
            $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($file->getRealPath());
            if (! isset(self::EXTENSIONS[$mime])) {
                abort(422, 'Formats acceptés : JPEG, PNG, WebP ou GIF.');
            }
            $name = Str::uuid()->toString().'.'.self::EXTENSIONS[$mime];
            $file->move($dir, $name);
            $urls[] = self::URL_PREFIX.$name;
        }

        return response()->json(['urls' => $urls], 201);
    }

    #[OA\Get(
        path: '/api/posts/images/{name}',
        summary: 'Afficher une photo de publication',
        tags: ['Posts'],
        parameters: [new OA\Parameter(name: 'name', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [new OA\Response(response: 200, description: 'Image'), new OA\Response(response: 404, description: 'Image introuvable')]
    )]
    public function show(string $name): BinaryFileResponse
    {
        if (! preg_match(self::NAME_PATTERN, $name)) {
            throw new NotFoundHttpException('Image introuvable.');
        }
        $path = self::directory().DIRECTORY_SEPARATOR.$name;
        if (! is_file($path) || dirname(realpath($path)) !== realpath(self::directory())) {
            throw new NotFoundHttpException('Image introuvable.');
        }
        $ext = pathinfo($name, PATHINFO_EXTENSION);

        return response()->file($path, [
            'Content-Type' => array_search($ext, self::EXTENSIONS, true),
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'public, max-age=86400, immutable',
        ]);
    }
}
