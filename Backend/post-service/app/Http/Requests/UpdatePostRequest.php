<?php

namespace App\Http\Requests;

use App\Models\Post;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePostRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // Les catégories appartiennent à category-service (base distincte) : même règle qu'à la création
            'category_id' => ['sometimes', 'integer', 'min:1'],
            'type' => ['sometimes', 'string', Rule::in([Post::TYPE_POST, Post::TYPE_QUESTION])],
            'title' => ['sometimes', 'string', 'min:3', 'max:255'],
            'content' => ['sometimes', 'string', 'min:5'],
            'images' => ['sometimes', 'array', 'max:4'],
            'images.*' => ['string', 'regex:/^\\/api\\/posts\\/images\\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(jpg|png|webp|gif)$/'],
        ];
    }

    public function messages(): array
    {
        return [
            'type.in' => 'Le type doit être "post" ou "question".',
            'title.min' => 'Le titre doit comporter au moins 3 caractères.',
            'title.max' => 'Le titre ne peut pas dépasser 255 caractères.',
            'content.min' => 'Le contenu doit comporter au moins 5 caractères.',
            'images.max' => '4 photos maximum par publication.',
            'images.*.regex' => 'Photo invalide : utilisez le téléversement de ParentConnect.',
        ];
    }
}
