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
            // Photos téléversées au préalable (POST /api/posts/images)
            'images' => ['sometimes', 'array', 'max:4'],
            'images.*' => ['string', 'regex:/^\\/api\\/posts\\/images\\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(jpg|png|webp|gif)$/'],
        ];
    }
}
