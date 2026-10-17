<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ReviewReportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'action' => ['required', 'string', Rule::in(['hide_content', 'reject'])],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        return [
            'action.required' => 'L\'action de modération est obligatoire.',
            'action.in' => 'L\'action doit être soit "hide_content" (masquer le contenu) soit "reject" (rejeter le signalement).',
        ];
    }
}
