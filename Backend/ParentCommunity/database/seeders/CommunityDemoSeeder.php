<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Comment;
use App\Models\Post;
use App\Models\Report;
use Illuminate\Database\Seeder;

class CommunityDemoSeeder extends Seeder
{
    public function run(): void
    {
        $catSante = Category::where('slug', 'sante-bebe')->first();
        $catSommeil = Category::where('slug', 'sommeil')->first();
        $catGarde = Category::where('slug', 'garde-denfants')->first();
        $catMateriel = Category::where('slug', 'materiel')->first();
        $catActivites = Category::where('slug', 'activites')->first();
        $catAlimentation = Category::where('slug', 'alimentation')->first();

        // 1. Post Santé bébé
        if ($catSante) {
            $post1 = Post::create([
                'author_id' => 'parent_sophie',
                'category_id' => $catSante->id,
                'type' => Post::TYPE_QUESTION,
                'title' => 'Bébé fait ses premières dents : quelles astuces naturelles pour soulager ses gencives ?',
                'content' => 'Bonjour chers voisins, notre bébé de 5 mois est très grognon et bave beaucoup à cause des poussées dentaires. Quels remèdes naturels ou anneaux réfrigérés conseillez-vous ?',
                'status' => Post::STATUS_PUBLISHED,
            ]);

            Comment::create([
                'post_id' => $post1->id,
                'author_id' => 'parent_marc',
                'content' => 'L\'anneau de dentition réfrigéré au réfrigérateur (attention, pas au congélateur) a fait des miracles pour notre fille !',
                'status' => Comment::STATUS_PUBLISHED,
            ]);

            Comment::create([
                'post_id' => $post1->id,
                'author_id' => 'pro_claire',
                'content' => 'Le massage doux des gencives avec un doigt parfaitement propre ou une compresse stérile humide apaise aussi très rapidement.',
                'status' => Comment::STATUS_PUBLISHED,
            ]);
        }

        // 2. Post Sommeil
        if ($catSommeil) {
            $post2 = Post::create([
                'author_id' => 'parent_lucas',
                'category_id' => $catSommeil->id,
                'type' => Post::TYPE_QUESTION,
                'title' => 'Régression du sommeil des 4 mois : combien de temps cela a-t-il duré chez vous ?',
                'content' => 'Notre petit dormait des nuits complètes et se réveille désormais 4 fois par nuit. Est-ce normal et combien de semaines cela a duré pour vous ?',
                'status' => Post::STATUS_PUBLISHED,
            ]);

            Comment::create([
                'post_id' => $post2->id,
                'author_id' => 'parent_emma',
                'content' => 'Courage Lucas ! Chez nous cela a duré 3 semaines. Gardez bien vos rituels du coucher sans trop changer vos repères.',
                'status' => Comment::STATUS_PUBLISHED,
            ]);
        }

        // 3. Post Garde d'enfants
        if ($catGarde) {
            Post::create([
                'author_id' => 'parent_amine',
                'category_id' => $catGarde->id,
                'type' => Post::TYPE_POST,
                'title' => 'Recherche famille pour garde partagée dès septembre prochain',
                'content' => 'Nous cherchons une famille sympathique dans le quartier des écoles pour partager une auxiliaire parentale 4 jours par semaine.',
                'status' => Post::STATUS_PUBLISHED,
            ]);
        }

        // 4. Post Matériel
        if ($catMateriel) {
            $post4 = Post::create([
                'author_id' => 'parent_lea',
                'category_id' => $catMateriel->id,
                'type' => Post::TYPE_POST,
                'title' => 'Donne poussette canne très bon état + habillage pluie',
                'content' => 'Notre enfant marche désormais très bien. Nous donnons avec plaisir une poussette canne pliable et propre à qui en a besoin.',
                'status' => Post::STATUS_PUBLISHED,
            ]);

            Comment::create([
                'post_id' => $post4->id,
                'author_id' => 'parent_kevin',
                'content' => 'Bonjour Léa, quel beau geste ! Est-elle encore disponible pour passer la chercher samedi ?',
                'status' => Comment::STATUS_PUBLISHED,
            ]);
        }

        // 5. Post Activités
        if ($catActivites) {
            Post::create([
                'author_id' => 'parent_sarah',
                'category_id' => $catActivites->id,
                'type' => Post::TYPE_POST,
                'title' => 'Atelier éveil musical et comptines au square samedi matin',
                'content' => 'Rencontre informelle entre parents et tout-petits (0-3 ans) pour chanter et échanger samedi à 10h30 au square central.',
                'status' => Post::STATUS_PUBLISHED,
            ]);
        }

        // 6. Post Alimentation
        if ($catAlimentation) {
            Post::create([
                'author_id' => 'parent_thomas',
                'category_id' => $catAlimentation->id,
                'type' => Post::TYPE_QUESTION,
                'title' => 'Diversification menée par l\'enfant (DME) ou purées classiques : vos retours d\'expérience ?',
                'content' => 'Nous hésitons entre débuter par des petites purées lisses à la cuillère ou tenter la DME avec des morceaux fondants.',
                'status' => Post::STATUS_PUBLISHED,
            ]);
        }

        // 7. Un signalement en attente pour tester la modération ADMIN
        if (isset($post1)) {
            Report::firstOrCreate(
                [
                    'reporter_id' => 'parent_vigilant',
                    'target_type' => Report::TARGET_POST,
                    'target_id' => $post1->id,
                ],
                [
                    'reason' => 'Vérification de recommandation médicale',
                    'details' => 'Signalement préventif pour s\'assurer de la conformité du conseil pédiatrique.',
                    'status' => Report::STATUS_PENDING,
                ]
            );
        }
    }
}
