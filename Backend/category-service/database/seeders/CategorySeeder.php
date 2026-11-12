<?php

namespace Database\Seeders;

use App\Models\Category;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class CategorySeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $categories = [
            [
                'name' => 'Santé bébé',
                'slug' => 'sante-bebe',
                'description' => 'Questions, conseils pédiatriques et santé des tout-petits (Baby health).',
            ],
            [
                'name' => 'Alimentation',
                'slug' => 'alimentation',
                'description' => 'Allaitement, diversification, recettes et nutrition (Food).',
            ],
            [
                'name' => 'Sommeil',
                'slug' => 'sommeil',
                'description' => 'Rythmes de sommeil, rituels du coucher et nuits paisibles (Sleep).',
            ],
            [
                'name' => 'Matériel',
                'slug' => 'materiel',
                'description' => 'Poussettes, sièges auto, vêtements et puériculture (Equipment).',
            ],
            [
                'name' => 'Garde d\'enfants',
                'slug' => 'garde-denfants',
                'description' => 'Nounous, crèches, baby-sitters et entraide locale (Childcare).',
            ],
            [
                'name' => 'Activités',
                'slug' => 'activites',
                'description' => 'Parcs, sorties en famille, jeux et ateliers d\'éveil (Activities).',
            ],
            [
                'name' => 'Autre',
                'slug' => 'autre',
                'description' => 'Discussions diverses et échanges d\'entraide entre parents (Other).',
            ],
        ];

        foreach ($categories as $cat) {
            Category::firstOrCreate(
                ['slug' => $cat['slug']],
                [
                    'name' => $cat['name'],
                    'description' => $cat['description'],
                ]
            );
        }
    }
}
