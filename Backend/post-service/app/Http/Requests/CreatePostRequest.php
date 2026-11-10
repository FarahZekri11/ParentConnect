<?php

namespace App\Http\Requests;

use App\Models\Post;
use Illuminate\Foundation\Http\FormRequest;

class CreatePostRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'category_id' => 'required|integer',
            'type' => 'required|string|in:' . Post::TYPE_POST . ',' . Post::TYPE_QUESTION,
            'title' => 'required|string|min:5|max:150',
            'content' => 'required|string|min:10|max:5000',
        ];
    }
}
