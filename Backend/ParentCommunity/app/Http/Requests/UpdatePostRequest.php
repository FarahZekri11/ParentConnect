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
            'category_id' => ['sometimes', 'integer', 'exists:categories,id'],
            'type' => ['sometimes', 'string', Rule::in([Post::TYPE_POST, Post::TYPE_QUESTION])],
            'title' => ['sometimes', 'string', 'min:3', 'max:255'],
            'content' => ['sometimes', 'string', 'min:5'],
        ];
    }

    public function messages(): array
    {
        return [
            'category_id.exists' => 'La catégorie sélectionnée n\'existe pas.',
            'type.in' => 'Le type doit être "post" ou "question".',
            'title.min' => 'Le titre doit comporter au moins 3 caractères.',
            'title.max' => 'Le titre ne peut pas dépasser 255 caractères.',
            'content.min' => 'Le contenu doit comporter au moins 5 caractères.',
        ];
    }
}
