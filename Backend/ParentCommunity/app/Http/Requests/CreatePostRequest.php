<?php

namespace App\Http\Requests;

use App\Models\Post;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CreatePostRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'category_id' => ['required', 'integer', 'exists:categories,id'],
            'type' => ['required', 'string', Rule::in([Post::TYPE_POST, Post::TYPE_QUESTION])],
            'title' => ['required', 'string', 'min:3', 'max:255'],
            'content' => ['required', 'string', 'min:5'],
        ];
    }

    public function messages(): array
    {
        return [
            'category_id.required' => 'La catégorie est obligatoire.',
            'category_id.exists' => 'La catégorie sélectionnée n\'existe pas.',
            'type.required' => 'Le type de publication (post ou question) est obligatoire.',
            'type.in' => 'Le type doit être "post" ou "question".',
            'title.required' => 'Le titre est obligatoire.',
            'title.min' => 'Le titre doit comporter au moins 3 caractères.',
            'title.max' => 'Le titre ne peut pas dépasser 255 caractères.',
            'content.required' => 'Le contenu est obligatoire.',
            'content.min' => 'Le contenu doit comporter au moins 5 caractères.',
        ];
    }
}
