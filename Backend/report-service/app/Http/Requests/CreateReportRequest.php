<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CreateReportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'min:3', 'max:255'],
            'details' => ['nullable', 'string', 'max:2000'],
        ];
    }

    public function messages(): array
    {
        return [
            'reason.required' => 'Le motif du signalement est obligatoire.',
            'reason.min' => 'Le motif doit comporter au moins 3 caractères.',
            'reason.max' => 'Le motif ne peut pas dépasser 255 caractères.',
            'details.max' => 'Les détails ne peuvent pas dépasser 2000 caractères.',
        ];
    }
}
