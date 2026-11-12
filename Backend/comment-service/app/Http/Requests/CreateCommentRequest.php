<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CreateCommentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'content' => ['required', 'string', 'min:2'],
        ];
    }

    public function messages(): array
    {
        return [
            'content.required' => 'Le commentaire ne peut pas être vide.',
            'content.min' => 'Le commentaire doit comporter au moins 2 caractères.',
        ];
    }
}
